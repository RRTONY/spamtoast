import { randomUUID } from "crypto";
import * as gh from "@/lib/admin/github-client";
import { ADMIN_BRANCH_PREFIX } from "@/lib/admin/guardrails";
import { createRecord, listRecords, patchRecord, readRecord } from "@/lib/admin/change-store";
import { previewUrlForPr } from "@/lib/admin/site-config";
import { waitForChecks } from "@/lib/admin/tools";
import type { McpUser } from "@/lib/admin/mcp-auth";
import {
  APPLIES_TO_LABELS,
  STATUS_LABELS,
  describeFiles,
  factsLine,
  goesLiveList,
  newChangeKey,
  normalizeAppliesTo,
  reviewChecks,
  reviewOutcome,
  reviewToken,
  type AffectedArea,
  type AppliesTo,
  type BeforeAfter,
  type BuildState,
  type ChangeStatus,
  type CheckRow,
  type LintRecord,
  type ReviewOutcome,
} from "@/lib/admin/change-describe";

// One "change set" per request the person makes in ChatGPT/Claude. Each has
// its own GitHub branch + pull request, so publishing one request never takes
// another request live with it.
//
// The record is a JSON file on the change-log branch (change-store.ts). It is
// the change history (it stays after publish or discard) and what "undo"
// works from. Everything on this site is code (no CMS), so a change is only
// files.

const OPEN_STATUSES: ChangeStatus[] = [
  "awaiting_confirmation",
  "draft",
  "ready_for_review",
];
// A build still "running" this long after the last edit is stuck.
const BUILD_STUCK_MS = 20 * 60_000;

export interface ChangeSet {
  _id: string;
  key: string;
  title: string;
  request: string;
  // The AI's plain restatement of the request, shown to the person before
  // any edit when the request could mean more than one thing.
  understoodAs?: string | null;
  appliesTo?: AppliesTo;
  requestedBy: { name: string; email: string };
  status: ChangeStatus;
  createdAt: string;
  lastEditedAt?: string | null;
  confirmedAt?: string | null;
  lint?: LintRecord | null;
  branch: string | null;
  prNumber: number | null;
  summary?: string | null;
  beforeAfter?: Array<BeforeAfter & { _key: string }>;
  files?: Array<{ _key: string; path: string; status: string }>;
  areas?: string[];
  submittedAt?: string | null;
  publishedAt?: string | null;
  publishedBy?: string | null;
  mergeSha?: string | null;
  discardedAt?: string | null;
  discardedBy?: string | null;
  undoes?: string | null;
  undoneBy?: string | null;
  publishNote?: string | null;
  // Link back to the chat the request came from, when the app gave one.
  conversationUrl?: string | null;
}

export type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

export function changeDocId(key: string): string {
  return `change.${key}`;
}

export function branchForChange(key: string): string {
  return `${ADMIN_BRANCH_PREFIX}${key}`;
}

function arrayKey(): string {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

function prUrl(prNumber: number): string {
  return `https://github.com/${gh.GITHUB_REPO.owner}/${gh.GITHUB_REPO.repo}/pull/${prNumber}`;
}

export async function getChangeSet(key: string): Promise<ChangeSet | null> {
  return readRecord<ChangeSet>(key);
}

export async function listChangeSets(opts: {
  statuses?: ChangeStatus[];
  limit?: number;
}): Promise<ChangeSet[]> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const statuses = opts.statuses?.length ? opts.statuses : null;
  return listRecords<ChangeSet>((c) => !statuses || statuses.includes(c.status), limit);
}

export function listOpenChangeSets(): Promise<ChangeSet[]> {
  return listChangeSets({ statuses: OPEN_STATUSES, limit: 100 });
}

export async function patchChangeSet(
  key: string,
  fields: Partial<ChangeSet>,
): Promise<void> {
  await patchRecord<ChangeSet>(key, fields);
}

export async function createChangeSet(input: {
  title: string;
  request: string;
  user: McpUser;
  undoes?: string;
  understoodAs?: string;
  appliesTo?: AppliesTo;
  needsConfirmation?: boolean;
  conversationUrl?: string | null;
}): Promise<ChangeSet> {
  const key = newChangeKey();
  const doc: ChangeSet = {
    _id: changeDocId(key),
    key,
    title: input.title.slice(0, 120),
    request: input.request.slice(0, 2000),
    understoodAs: input.understoodAs?.slice(0, 600) || null,
    appliesTo: normalizeAppliesTo(input.appliesTo),
    requestedBy: { name: input.user.name, email: input.user.email },
    status: input.needsConfirmation ? "awaiting_confirmation" : "draft",
    createdAt: new Date().toISOString(),
    branch: null,
    prNumber: null,
    undoes: input.undoes ?? null,
    conversationUrl: input.conversationUrl ?? null,
  };
  await createRecord(doc);
  return doc;
}

export function isOpen(change: ChangeSet): boolean {
  return OPEN_STATUSES.includes(change.status);
}

// Any edit after "Ready for review" sends the change back to Draft, so the
// summary and review always describe the latest version. The edit time is
// what "stuck" is measured from.
export async function markEdited(change: ChangeSet): Promise<void> {
  const lastEditedAt = new Date().toISOString();
  if (change.status === "ready_for_review") {
    await patchChangeSet(change.key, {
      status: "draft",
      submittedAt: null,
      lastEditedAt,
    });
    change.status = "draft";
  } else {
    await patchChangeSet(change.key, { lastEditedAt });
  }
  change.lastEditedAt = lastEditedAt;
}

// The person said yes to what the AI understood (and picked desktop,
// mobile or both). Only then may the AI start editing.
export async function confirmChange(
  key: string,
  appliesTo: unknown,
): Promise<Result<{ changeId: string; appliesTo: AppliesTo }>> {
  const change = await getChangeSet(key);
  if (!change) return fail(`No change found with id ${key}.`);
  if (change.status !== "awaiting_confirmation") {
    return change.status === "draft" || change.status === "ready_for_review"
      ? { ok: true, changeId: key, appliesTo: change.appliesTo ?? "both" }
      : fail(
          `This change is already ${STATUS_LABELS[change.status].toLowerCase()}.`,
        );
  }
  const scope =
    appliesTo === undefined || appliesTo === null || appliesTo === ""
      ? (change.appliesTo ?? "both")
      : normalizeAppliesTo(appliesTo);
  await patchChangeSet(key, {
    status: "draft",
    appliesTo: scope,
    confirmedAt: new Date().toISOString(),
  });
  return { ok: true, changeId: key, appliesTo: scope };
}

// The server's own lint run over the code files a change touches, at one
// exact version. Loaded lazily: ESLint is heavy and only needed here.
async function lintAt(
  headSha: string,
  files: Array<{ path: string; status: string }>,
): Promise<LintRecord> {
  const { lintChangedFiles } = await import("@/lib/admin/code-check");
  const withContent = await Promise.all(
    files
      .filter((f) => f.status !== "removed")
      .map(async (f) => ({
        path: f.path,
        content: (await gh.getFile(f.path, headSha))?.content ?? null,
      })),
  );
  return { headSha, files: await lintChangedFiles(withContent) };
}

export interface ChangeReview {
  changeId: string;
  title: string;
  // The one status to show, with what to do next and which buttons work.
  state: ReviewOutcome["state"];
  stateLabel: string;
  nextStep: string;
  actions: ReviewOutcome["actions"];
  checks: CheckRow[];
  goesLive: string[];
  understoodAs: string | null;
  appliesTo: AppliesTo;
  appliesToLabel: string;
  status: ChangeStatus;
  statusLabel: string;
  requestedBy: string;
  createdAt: string;
  request: string;
  summary: string | null;
  facts: string;
  areas: AffectedArea[];
  files: Array<{ path: string; status: string }>;
  beforeAfter: BeforeAfter[];
  previewUrl: string | null;
  previewLinks: Array<{ label: string; url: string }>;
  checkStatus: string | null;
  checkNote?: string;
  failingChecks: gh.FailingCheck[];
  prUrl: string | null;
  reviewToken: string;
  headSha: string | null;
  canPublish: boolean;
  blockers: string[];
  undoes: string | null;
}

// Everything the person needs to decide: what will go live (pages, in
// plain words), before/after, the site check, preview links,
// and a fingerprint (reviewToken) that Publish must echo back.
export async function buildReview(
  change: ChangeSet,
  otherPendingCount: number,
): Promise<ChangeReview> {
  let files: Array<{ path: string; status: string }> = [];
  let headSha: string | null = null;
  let checks: (gh.PRChecksDetail & { note?: string }) | null = null;

  if (change.prNumber && isOpen(change)) {
    const [compare, sha, detail] = await Promise.all([
      gh.compareToDefaultBranch(branchForChange(change.key)),
      gh.getPRHeadSha(change.prNumber),
      waitForChecks(change.prNumber),
    ]);
    files = compare.files.map((f) => ({ path: f.path, status: f.status }));
    headSha = sha;
    checks = detail;
  } else if (!isOpen(change)) {
    files = (change.files ?? []).map((f) => ({
      path: f.path,
      status: f.status,
    }));
  }

  // Lint the exact version under review if it hasn't been yet (normally done
  // at submit; this catches anything pushed after that).
  let lint = change.lint ?? null;
  if (
    isOpen(change) &&
    change.status === "ready_for_review" &&
    headSha &&
    lint?.headSha !== headSha
  ) {
    try {
      lint = await lintAt(headSha, files);
      await patchChangeSet(change.key, { lint });
    } catch (err) {
      lint = {
        headSha,
        files: [
          {
            path: "(all files)",
            errors: 0,
            warnings: 0,
            couldNotRun: String(err).slice(0, 200),
          },
        ],
      };
    }
  }

  const areas = describeFiles(files.map((f) => f.path));
  const previewUrl = checks?.previewUrl ?? null;

  const lastEdit = Date.parse(
    change.lastEditedAt ?? change.submittedAt ?? change.createdAt,
  );
  const checkRows = reviewChecks({
    hasCode: !!change.prNumber,
    build:
      ((checks?.build ?? checks?.status) as BuildState | undefined) ?? null,
    ci: (checks?.ci as BuildState | undefined) ?? null,
    ciWaiting: checks?.ciWaiting ?? [],
    ciFailing: checks?.ciFailing ?? [],
    buildStuck:
      checks?.status === "pending" &&
      Number.isFinite(lastEdit) &&
      Date.now() - lastEdit > BUILD_STUCK_MS,
    headSha,
    lint,
  });
  const problems: string[] = [];
  if (files.length === 0 && isOpen(change)) {
    problems.push("Nothing has been changed yet");
  }
  const outcome = reviewOutcome({
    status: change.status,
    checks: checkRows,
    hasPreview: !!previewUrl && (checks?.build ?? checks?.status) === "success",
    problems,
  });
  const appliesTo = change.appliesTo ?? "both";

  const blockers: string[] = [];
  if (change.status !== "ready_for_review") {
    blockers.push(
      change.status === "draft"
        ? "Still being worked on. The AI needs to finish and submit it for review."
        : `Already ${STATUS_LABELS[change.status].toLowerCase()}.`,
    );
  }
  if (files.length === 0 && isOpen(change)) {
    blockers.push("Nothing has been changed yet.");
  }
  for (const c of checkRows) {
    if (!c.required) continue;
    if (c.state === "failed") blockers.push(`${c.label} failed.`);
    if (c.state === "could_not_run") blockers.push(`${c.label} could not run.`);
    if (c.state === "timed_out") blockers.push(`${c.label} is stuck.`);
    if (c.state === "running" || c.state === "not_run")
      blockers.push(`${c.label} hasn't finished.`);
  }

  return {
    changeId: change.key,
    title: change.title,
    state: outcome.state,
    stateLabel: outcome.label,
    nextStep: outcome.nextStep,
    actions: outcome.actions,
    checks: checkRows,
    goesLive: goesLiveList({
      summary: change.summary ?? null,
      appliesTo,
      areas,
      otherPendingCount,
    }),
    understoodAs: change.understoodAs ?? null,
    appliesTo,
    appliesToLabel: APPLIES_TO_LABELS[appliesTo],
    status: change.status,
    statusLabel: STATUS_LABELS[change.status],
    requestedBy: change.requestedBy?.name ?? "Unknown",
    createdAt: change.createdAt,
    request: change.request,
    summary: change.summary ?? null,
    facts: factsLine({
      areas,
      checkStatus: checks?.status ?? null,
      otherPendingCount,
    }),
    areas,
    files,
    beforeAfter: (change.beforeAfter ?? []).map(({ label, before, after }) => ({
      label,
      before,
      after,
    })),
    previewUrl,
    previewLinks: previewUrl
      ? areas
          .filter((a) => a.route)
          .map((a) => ({ label: a.label, url: `${previewUrl}${a.route}` }))
      : [],
    checkStatus: checks?.status ?? null,
    ...(checks?.note ? { checkNote: checks.note } : {}),
    failingChecks: checks?.failingChecks ?? [],
    prUrl: change.prNumber ? prUrl(change.prNumber) : null,
    reviewToken: reviewToken(headSha),
    headSha,
    canPublish: blockers.length === 0 && outcome.actions.publish,
    blockers,
    undoes: change.undoes ?? null,
  };
}

export interface PendingOverview {
  changes: Array<{
    changeId: string;
    title: string;
    status: ChangeStatus;
    statusLabel: string;
    requestedBy: string;
    createdAt: string;
  }>;
  // Waiting changes from before change sets existed (no record): can be
  // discarded, not published.
  olderChanges: Array<{
    changeId: string | null;
    prNumber: number;
    prUrl: string;
  }>;
}

export async function pendingOverview(
  open?: ChangeSet[],
): Promise<PendingOverview> {
  const changes = open ?? (await listOpenChangeSets());
  const prs = await gh.listOpenAdminPRs(ADMIN_BRANCH_PREFIX);
  const ownedPrs = new Set(changes.map((c) => c.prNumber).filter(Boolean));
  return {
    changes: changes.map((c) => ({
      changeId: c.key,
      title: c.title,
      status: c.status,
      statusLabel: STATUS_LABELS[c.status],
      requestedBy: c.requestedBy?.name ?? "Unknown",
      createdAt: c.createdAt,
    })),
    olderChanges: prs
      .filter((pr) => !ownedPrs.has(pr.number))
      .map((pr) => ({
        changeId: pr.branch.slice(ADMIN_BRANCH_PREFIX.length) || null,
        prNumber: pr.number,
        prUrl: pr.url,
      })),
  };
}

// "Other Pending Changes" (team feedback 2026-10-08): every change-related
// answer lists the other waiting changes, so an old one is never forgotten.
// Built from the records alone (one query, no GitHub calls), so it is cheap
// enough to attach to every result; the full checks load when one is opened.
export interface PendingRow {
  changeId: string;
  title: string;
  request: string;
  status: ChangeStatus;
  statusLabel: string;
  requestedBy: string;
  createdAt: string;
  previewUrl: string | null;
  conversationUrl: string | null;
  // Only a hint for the buttons: publish_changes re-checks everything.
  readyToPublish: boolean;
}

export function pendingRows(
  changes: ChangeSet[],
  excludeKey?: string | null,
): PendingRow[] {
  return changes
    .filter((c) => c.key !== excludeKey && OPEN_STATUSES.includes(c.status))
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))
    .map((c) => ({
      changeId: c.key,
      title: c.title,
      request: c.request,
      status: c.status,
      statusLabel: STATUS_LABELS[c.status],
      requestedBy: c.requestedBy?.name ?? "Unknown",
      createdAt: c.createdAt,
      previewUrl: c.prNumber ? previewUrlForPr(c.prNumber) : null,
      conversationUrl: c.conversationUrl ?? null,
      readyToPublish: c.status === "ready_for_review",
    }));
}

export function otherPendingText(rows: PendingRow[] | null): string {
  if (!rows) return "Couldn't load the other pending changes just now.";
  if (!rows.length) return "No other pending changes.";
  return rows
    .map((r) => {
      const asked = new Date(r.createdAt).toLocaleString("en-US", {
        timeZone: "America/Los_Angeles",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      const links = [
        r.previewUrl ? `Preview: ${r.previewUrl}` : "No preview yet",
        r.conversationUrl
          ? `Original conversation: ${r.conversationUrl}`
          : "Original conversation: not recorded",
      ].join(" | ");
      return `- ${r.title} (change_id ${r.changeId}): ${r.statusLabel}. Asked by ${r.requestedBy}, ${asked} PT. Request: "${r.request}". ${links}`;
    })
    .join("\n");
}

// Keeps records and GitHub in step when someone acts in GitHub directly:
// a change merged there is marked Published, one closed there is marked
// Discarded, and any
// leftover AI branch with no open pull request and no waiting change is
// deleted. Runs when waiting changes are listed (a person's action), never
// on a timer. Failures are swallowed: tidying must never block a review.
export async function reconcileWithGitHub(
  open: ChangeSet[],
): Promise<ChangeSet[]> {
  const stillOpen: ChangeSet[] = [];
  for (const change of open) {
    if (!change.prNumber) {
      stillOpen.push(change);
      continue;
    }
    try {
      const pr = await gh.getPRState(change.prNumber);
      if (pr.open) {
        stillOpen.push(change);
      } else if (pr.merged) {
        await patchChangeSet(change.key, {
          status: "published",
          publishedAt: new Date().toISOString(),
          publishedBy: "Merged directly in GitHub",
          mergeSha: pr.mergeSha,
        });
        await gh.deleteBranch(branchForChange(change.key)).catch(() => {});
      } else {
        await patchChangeSet(change.key, {
          status: "discarded",
          discardedAt: new Date().toISOString(),
          discardedBy: "Closed directly in GitHub",
        });
        await gh.deleteBranch(branchForChange(change.key)).catch(() => {});
      }
    } catch {
      stillOpen.push(change);
    }
  }

  try {
    const [branches, prs] = await Promise.all([
      gh.listBranches(ADMIN_BRANCH_PREFIX),
      gh.listOpenAdminPRs(ADMIN_BRANCH_PREFIX),
    ]);
    const keep = new Set([
      ...prs.map((p) => p.branch),
      ...stillOpen.map((c) => branchForChange(c.key)),
    ]);
    for (const branch of branches) {
      if (!keep.has(branch)) await gh.deleteBranch(branch).catch(() => {});
    }
  } catch {
    // Listing branches failed; try again next time.
  }
  return stillOpen;
}

export async function submitForReview(
  change: ChangeSet,
  summary: string,
  beforeAfter: BeforeAfter[],
): Promise<Result<{ status: ChangeStatus; lint: LintRecord | null }>> {
  if (!isOpen(change)) {
    return fail(
      `This change is already ${STATUS_LABELS[change.status].toLowerCase()}.`,
    );
  }
  if (change.status === "awaiting_confirmation") {
    return fail(
      "The person hasn't confirmed what you understood yet. Wait for their yes (confirm_change) before working on it.",
    );
  }
  let files: Array<{ path: string; status: string }> = [];
  if (change.branch) {
    const compare = await gh.compareToDefaultBranch(change.branch);
    files = compare.files.map((f) => ({ path: f.path, status: f.status }));
  }
  if (files.length === 0) {
    return fail(
      "Nothing has been changed in this change yet, so there's nothing to review.",
    );
  }
  let lint: LintRecord | null = null;
  const headSha = change.prNumber
    ? await gh.getPRHeadSha(change.prNumber)
    : null;
  if (headSha) {
    try {
      lint = await lintAt(headSha, files);
    } catch (err) {
      lint = {
        headSha,
        files: [
          {
            path: "(all files)",
            errors: 0,
            warnings: 0,
            couldNotRun: String(err).slice(0, 200),
          },
        ],
      };
    }
  }
  await patchChangeSet(change.key, {
    lint,
    status: "ready_for_review",
    summary: summary.slice(0, 1000),
    beforeAfter: beforeAfter.slice(0, 20).map((b) => ({
      _key: arrayKey(),
      label: b.label.slice(0, 120),
      before: b.before.slice(0, 500),
      after: b.after.slice(0, 500),
    })),
    files: files.map((f) => ({ _key: arrayKey(), ...f })),
    areas: describeFiles(files.map((f) => f.path)).map((a) => a.label),
    submittedAt: new Date().toISOString(),
  });
  return { ok: true, status: "ready_for_review", lint };
}

export async function publishChange(
  key: string,
  token: string,
  user: McpUser,
): Promise<
  Result<{ changeId: string; mergeSha: string | null }>
> {
  const change = await getChangeSet(key);
  if (!change) return fail(`No change found with id ${key}.`);
  if (change.status !== "ready_for_review") {
    return fail(
      change.status === "draft"
        ? "This change is still a draft. The AI must finish it and submit it for review first."
        : `This change is already ${STATUS_LABELS[change.status].toLowerCase()}.`,
    );
  }

  const headSha = change.prNumber
    ? await gh.getPRHeadSha(change.prNumber)
    : null;
  const current = reviewToken(headSha);
  if (current !== token) {
    return fail(
      "This change was updated after it was reviewed. Review it again (list_pending_changes) before publishing.",
    );
  }
  if (!change.prNumber) {
    return fail("This change has nothing in it to publish.");
  }

  // Check everything before changing anything.
  const lint = change.lint;
  if (!lint || lint.headSha !== headSha) {
    return fail(
      "Lint hasn't run on this exact version yet. Review it again (list_pending_changes), then publish.",
    );
  }
  const broken = lint.files.find((f) => f.couldNotRun);
  if (broken) {
    return fail(
      `Lint could not run (${broken.couldNotRun}). It has to run before this can go live. Retry, or ask the webmaster.`,
    );
  }
  const status = await gh.getPRCombinedStatus(change.prNumber);
  if (status === "failure") {
    return fail(
      "The site check failed for this change. It needs a fix before it can go live.",
    );
  }
  if (status === "pending") {
    return fail("The site check is still running. Try again in a minute.");
  }

  let mergeSha: string | null = null;
  try {
    const merged = await gh.mergePR(change.prNumber, headSha ?? undefined);
    if (!merged.merged) return fail("GitHub could not merge this change.");
    mergeSha = merged.sha;
  } catch (err) {
    const status = gh.errorStatus(err);
    if (status === 409) {
      return fail(
        "This change was updated after it was reviewed. Review it again before publishing.",
      );
    }
    if (status === 405) {
      return fail(
        "This change can't go live as is, most likely because another published change edited the same file. Discard it and ask again.",
      );
    }
    throw err;
  }
  try {
    await gh.deleteBranch(branchForChange(change.key));
  } catch {
    // GitHub may already have deleted it on merge.
  }

  // Snapshot of what actually went live, for history. Falls back to the
  // list saved at review time if GitHub can't be read right now.
  let files = change.files ?? [];
  if (mergeSha) {
    try {
      const merged = await gh.getCommitFiles(mergeSha);
      files = merged.files.map((f) => ({
        _key: arrayKey(),
        path: f.path,
        status: f.status,
      }));
    } catch {
      // keep the review-time list
    }
  }

  await patchChangeSet(change.key, {
    status: "published",
    publishedAt: new Date().toISOString(),
    publishedBy: user.name,
    mergeSha,
    files,
    areas: describeFiles(files.map((f) => f.path)).map((a) => a.label),
  });
  if (change.undoes) {
    await patchChangeSet(change.undoes, { undoneBy: change.key });
  }
  return { ok: true, changeId: change.key, mergeSha };
}

export async function discardChange(
  key: string,
  user: McpUser,
): Promise<Result<{ changeId: string; olderChange?: boolean }>> {
  const change = await getChangeSet(key);
  if (!change) {
    // A waiting change from before change sets existed: just close it.
    const pr = (await gh.listOpenAdminPRs(ADMIN_BRANCH_PREFIX)).find(
      (p) => p.branch === branchForChange(key),
    );
    if (!pr) return fail(`No waiting change found with id ${key}.`);
    await gh.closePR(pr.number);
    await gh.deleteBranch(pr.branch).catch(() => {});
    return { ok: true, changeId: key, olderChange: true };
  }
  if (!isOpen(change)) {
    return fail(
      `This change is already ${STATUS_LABELS[change.status].toLowerCase()}, so it can't be discarded.`,
    );
  }

  if (change.prNumber) await gh.closePR(change.prNumber);
  if (change.branch) await gh.deleteBranch(change.branch).catch(() => {});
  await patchChangeSet(change.key, {
    status: "discarded",
    discardedAt: new Date().toISOString(),
    discardedBy: user.name,
  });
  return { ok: true, changeId: change.key };
}

// Undo a published change: builds a NEW change (marked "Undo: ...") that
// puts every file back the way it was before. It goes
// through the same review and Publish as anything else, so nothing changes
// on the live site until someone approves it. Refuses if any of those files
// were changed again since, rather than wiping out later work.
export async function undoChange(
  key: string,
  user: McpUser,
): Promise<Result<{ changeId: string; title: string }>> {
  const orig = await getChangeSet(key);
  if (!orig) return fail(`No change found with id ${key}.`);
  if (orig.status !== "published") {
    return fail(
      "Only a published change can be undone. A waiting change can simply be discarded.",
    );
  }
  if (orig.undoneBy) {
    return fail(`This change was already undone by change ${orig.undoneBy}.`);
  }
  const open = await listOpenChangeSets();
  const pendingUndo = open.find((c) => c.undoes === key);
  if (pendingUndo) {
    return fail(
      `An undo for this change is already waiting for review (${pendingUndo.key}).`,
    );
  }

  const conflicts: string[] = [];
  const fileStates: Array<{ path: string; sha: string | null }> = [];
  if (orig.mergeSha) {
    const base = await gh.getDefaultBranch();
    const { parentSha, files } = await gh.getCommitFiles(orig.mergeSha);
    for (const f of files) {
      const paths =
        f.status === "renamed" && f.previousPath
          ? [f.path, f.previousPath]
          : [f.path];
      for (const p of paths) {
        const [now, atMerge] = await Promise.all([
          gh.getFileSha(p, base),
          gh.getFileSha(p, orig.mergeSha),
        ]);
        if (now !== atMerge) conflicts.push(describeFiles([p])[0].label);
      }
      if (f.status === "renamed" && f.previousPath) {
        fileStates.push({ path: f.path, sha: null });
        fileStates.push({
          path: f.previousPath,
          sha: await gh.getFileSha(f.previousPath, parentSha),
        });
      } else {
        fileStates.push({
          path: f.path,
          sha:
            f.status === "added"
              ? null
              : await gh.getFileSha(f.path, parentSha),
        });
      }
    }
  }

  if (conflicts.length) {
    return fail(
      `Can't undo automatically: these were changed again after this change went live, and undoing would wipe out that later work too: ${[...new Set(conflicts)].join("; ")}. Ask for the specific fix you want instead.`,
    );
  }
  if (fileStates.length === 0) {
    return fail("This change has nothing recorded that can be undone.");
  }

  const when = orig.publishedAt ? orig.publishedAt.slice(0, 10) : "earlier";
  const change = await createChangeSet({
    title: `Undo: ${orig.title}`.slice(0, 120),
    request: `Put things back the way they were before "${orig.title}" (published ${when}).`,
    user,
    undoes: orig.key,
  });

  let branch: string | null = null;
  let prNumber: number | null = null;
  if (fileStates.length) {
    branch = branchForChange(change.key);
    await gh.createBranchWithFileStates(
      branch,
      fileStates,
      `Undo "${orig.title}" [by ${user.name}]`,
    );
    const pr = await gh.openPR(
      branch,
      change.title,
      `Undo of change ${orig.key} (PR #${orig.prNumber ?? "n/a"}), requested by ${user.name} via the SpamToast MCP server.`,
    );
    prNumber = pr.number;
  }

  const files = fileStates.map((f) => ({
    _key: arrayKey(),
    path: f.path,
    status: f.sha ? "modified" : "removed",
  }));
  const areas = describeFiles(files.map((f) => f.path)).map((a) => a.label);
  await patchChangeSet(change.key, {
    branch,
    prNumber,
    files,
    areas,
    status: "ready_for_review",
    submittedAt: new Date().toISOString(),
    summary: `Puts things back the way they were before "${orig.title}" (published ${when}).`,
  });
  return { ok: true, changeId: change.key, title: change.title };
}

export interface HistoryEntry {
  changeId: string;
  title: string;
  status: ChangeStatus;
  statusLabel: string;
  requestedBy: string;
  createdAt: string;
  publishedAt: string | null;
  publishedBy: string | null;
  discardedAt: string | null;
  discardedBy: string | null;
  changed: string[];
  summary: string | null;
  undoes: string | null;
  undoneBy: string | null;
  canUndo: boolean;
}

export async function changeHistory(limit: number): Promise<HistoryEntry[]> {
  const records = await listChangeSets({ limit });
  return records.map((c) => ({
    changeId: c.key,
    title: c.title,
    status: c.status,
    statusLabel: STATUS_LABELS[c.status],
    requestedBy: c.requestedBy?.name ?? "Unknown",
    createdAt: c.createdAt,
    publishedAt: c.publishedAt ?? null,
    publishedBy: c.publishedBy ?? null,
    discardedAt: c.discardedAt ?? null,
    discardedBy: c.discardedBy ?? null,
    changed: c.areas ?? [],
    summary: c.summary ?? null,
    undoes: c.undoes ?? null,
    undoneBy: c.undoneBy ?? null,
    canUndo: c.status === "published" && !c.undoneBy,
  }));
}
