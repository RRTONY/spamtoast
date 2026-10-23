import { createHash } from "crypto";

// Plain-language helpers for the change review card and change history:
// which pages a file change touches and a fingerprint of exactly what was
// reviewed, so Publish can refuse if anything changed after the person
// looked at it. Pure functions only.

export type ChangeStatus =
  | "awaiting_confirmation"
  | "draft"
  | "ready_for_review"
  | "published"
  | "discarded";

export const STATUS_LABELS: Record<ChangeStatus, string> = {
  awaiting_confirmation: "Waiting for your OK",
  draft: "Draft",
  ready_for_review: "Ready for review",
  published: "Published",
  discarded: "Discarded",
};

export interface AffectedArea {
  label: string;
  // A real page address to open on the preview/live site, when there is one.
  route: string | null;
  shared: boolean;
}

const SHARED_COMPONENTS: Record<string, string> = {
  "src/components/manifesto/manifesto-nav.tsx": "Site header (every page)",
  "src/components/manifesto/manifesto-footer.tsx": "Site footer (every page)",
};

function routeFromAppPath(segments: string[]): string {
  const kept = segments.filter(
    (s) => !(s.startsWith("(") && s.endsWith(")")) && !s.startsWith("@"),
  );
  return "/" + kept.join("/");
}

function pageName(route: string): string {
  return route === "/" ? "Home page" : `${route} page`;
}

export function describeFile(path: string): AffectedArea {
  if (SHARED_COMPONENTS[path]) {
    return { label: SHARED_COMPONENTS[path], route: null, shared: true };
  }
  if (path === "src/app/globals.css") {
    return {
      label: "Site-wide styles (every page)",
      route: null,
      shared: true,
    };
  }
  if (path === "src/app/layout.tsx") {
    return { label: "Frame around every page", route: null, shared: true };
  }
  if (path === "next.config.ts" || path === "next.config.js") {
    return { label: "Site settings (redirects)", route: null, shared: true };
  }
  if (path === "src/lib/content/wall-of-shame.ts") {
    return { label: "Wall of Shame (home page)", route: "/#wall-of-shame", shared: false };
  }
  if (path.startsWith("src/lib/content/")) {
    const name = path.slice("src/lib/content/".length).replace(/\.(ts|tsx)$/, "");
    return { label: `Site data "${name}" (page text and lists)`, route: null, shared: true };
  }

  const app = path.match(
    /^src\/app\/(?:(.*)\/)?(page|layout)\.(tsx|ts|jsx|js)$/,
  );
  if (app) {
    const segments = (app[1] ?? "").split("/").filter(Boolean);
    const route = routeFromAppPath(segments);
    const dynamic = segments.some((s) => s.startsWith("["));
    if (app[2] === "layout") {
      return {
        label: `Frame around the ${route} pages`,
        route: dynamic ? null : route,
        shared: true,
      };
    }
    return dynamic
      ? { label: `Every ${route} page`, route: null, shared: true }
      : { label: pageName(route), route, shared: false };
  }

  const inPage = path.match(/^src\/app\/(.+)\/[^/]+\.(tsx|ts|jsx|js|css)$/);
  if (inPage && !inPage[1].startsWith("api")) {
    const segments = inPage[1].split("/").filter((s) => !s.startsWith("_"));
    const route = routeFromAppPath(segments);
    const dynamic = segments.some((s) => s.startsWith("["));
    return dynamic
      ? { label: `Every ${route} page`, route: null, shared: true }
      : { label: pageName(route), route, shared: false };
  }

  const component = path.match(/^src\/components\/(.+)\.(tsx|ts|jsx|js)$/);
  if (component) {
    const name = component[1].split("/").pop() ?? component[1];
    return {
      label: `Shared section "${name}" (may appear on several pages)`,
      route: null,
      shared: true,
    };
  }

  if (path.startsWith("public/")) {
    return {
      label: `Image or file: ${path.slice("public/".length)}`,
      route: null,
      shared: false,
    };
  }

  return {
    label: `Behind-the-scenes file: ${path}`,
    route: null,
    shared: false,
  };
}

export function describeFiles(paths: string[]): AffectedArea[] {
  const seen = new Map<string, AffectedArea>();
  for (const p of paths) {
    const area = describeFile(p);
    if (!seen.has(area.label)) seen.set(area.label, area);
  }
  return [...seen.values()];
}

export interface BeforeAfter {
  label: string;
  before: string;
  after: string;
}

// Fingerprint of exactly what the person reviewed: the code version (the
// pull request's latest commit). Publish requires it and refuses if it no
// longer matches, so nothing added after the review can slip out with it.
export function reviewToken(headSha: string | null): string {
  return createHash("sha256")
    .update(headSha ?? "no-code")
    .digest("hex")
    .slice(0, 16);
}

const CHECK_WORDS: Record<string, string> = {
  success: "Site check passed.",
  pending: "Site check is still running.",
  failure: "Site check failed, this needs a fix before it can go live.",
  unknown: "",
};

// Server-written facts that sit under the AI's own summary, so the person
// always sees what is (and is not) included even if the AI's wording is off.
export function factsLine(input: {
  areas: AffectedArea[];
  checkStatus: string | null;
  otherPendingCount: number;
}): string {
  const changed = input.areas.map((a) => a.label);
  const parts: string[] = [];
  parts.push(
    changed.length
      ? `Changes: ${changed.join("; ")}.`
      : "Nothing has been changed yet.",
  );
  parts.push(
    input.otherPendingCount > 0
      ? `${input.otherPendingCount} other waiting change${input.otherPendingCount === 1 ? " is" : "s are"} NOT included.`
      : "No other changes are included.",
  );
  if (input.checkStatus && CHECK_WORDS[input.checkStatus]) {
    parts.push(CHECK_WORDS[input.checkStatus]);
  }
  return parts.join(" ");
}

export function newChangeKey(now = new Date()): string {
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.random().toString(36).slice(2, 8).padEnd(6, "0");
  return `${stamp}-${suffix}`;
}

// Accepts "20261002-ab12cd", "change.20261002-ab12cd" or the branch
// name, so an AI passing back any of the forms it was shown still works.
export function normalizeChangeKey(raw: unknown): string | null {
  const s = String(raw ?? "")
    .trim()
    .replace(/^(?:adminChange|change)\./, "")
    .replace(/^admin\/mcp-/, "");
  return /^\d{8}-[a-z0-9]{6}$/.test(s) ? s : null;
}

// Neither ChatGPT nor Claude tells the server which chat a request came
// from (checked 2026-10-08), so a link is only saved when the person shares
// one. Only real chat addresses, so the card never opens anything else.
const CONVERSATION_HOSTS = ["chatgpt.com", "chat.openai.com", "claude.ai"];

export function normalizeConversationUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" &&
      CONVERSATION_HOSTS.includes(url.hostname.toLowerCase()) &&
      url.pathname.length > 1
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

// ── One status, one next step ────────────────────────────────────────────────
// The review card and the AI both show exactly one of these, worked out by
// the server from the change's status and its checks, so the person never
// has to piece together "ready" + "still running" + "not ready" themselves.

export type AppliesTo = "both" | "desktop" | "mobile";

export const APPLIES_TO_LABELS: Record<AppliesTo, string> = {
  both: "Desktop and mobile",
  desktop: "Desktop only (mobile unchanged)",
  mobile: "Mobile only (desktop unchanged)",
};

export function normalizeAppliesTo(raw: unknown): AppliesTo {
  return raw === "desktop" || raw === "mobile" ? raw : "both";
}

export type CheckKey = "build" | "typecheck" | "lint" | "ci";
export type CheckState =
  | "passed"
  | "issues"
  | "running"
  | "failed"
  | "could_not_run"
  | "not_run"
  | "timed_out"
  | "not_needed";

export interface CheckRow {
  key: CheckKey;
  label: string;
  state: CheckState;
  detail: string;
  // Publish stays blocked until every required check has finished and none
  // failed or could not run.
  required: boolean;
}

// Saved on the change record by the server's own lint run (submit and
// review), for one exact version of the code.
export interface LintRecord {
  headSha: string;
  files: Array<{
    path: string;
    errors: number;
    warnings: number;
    couldNotRun?: string | null;
  }>;
}

export type BuildState = "success" | "pending" | "failure" | "unknown";

export function reviewChecks(input: {
  hasCode: boolean;
  // Netlify's preview build only.
  build: BuildState | null;
  // True when anything has been running 20+ minutes since the last edit.
  buildStuck: boolean;
  // GitHub Actions jobs (tests, lint and format of changed files).
  ci?: BuildState | null;
  ciWaiting?: string[];
  ciFailing?: string[];
  headSha: string | null;
  lint: LintRecord | null;
}): CheckRow[] {
  if (!input.hasCode) {
    const note = "Content-only change, nothing to build.";
    return [
      {
        key: "build",
        label: "Build",
        state: "not_needed",
        detail: note,
        required: false,
      },
      {
        key: "typecheck",
        label: "Type check",
        state: "not_needed",
        detail: note,
        required: false,
      },
      {
        key: "lint",
        label: "Lint",
        state: "not_needed",
        detail: note,
        required: false,
      },
      {
        key: "ci",
        label: "GitHub checks",
        state: "not_needed",
        detail: note,
        required: false,
      },
    ];
  }

  const build: CheckRow =
    input.build === "success"
      ? {
          key: "build",
          label: "Build",
          state: "passed",
          detail: "The preview site built.",
          required: true,
        }
      : input.build === "failure"
        ? {
            key: "build",
            label: "Build",
            state: "failed",
            detail: "The preview site didn't build. The AI needs to fix it.",
            required: true,
          }
        : input.buildStuck
          ? {
              key: "build",
              label: "Build",
              state: "timed_out",
              detail: "Has been running for over 20 minutes.",
              required: true,
            }
          : {
              key: "build",
              label: "Build",
              state: "running",
              detail: "Building the preview site (usually 2 to 4 minutes).",
              required: true,
            };

  // `next build` type-checks, so the build result is the type check result.
  const typecheck: CheckRow = {
    key: "typecheck",
    label: "Type check",
    required: true,
    ...(build.state === "passed"
      ? { state: "passed" as const, detail: "Checked as part of the build." }
      : build.state === "failed"
        ? {
            state: "failed" as const,
            detail: "Runs inside the build, which failed.",
          }
        : build.state === "timed_out"
          ? {
              state: "timed_out" as const,
              detail: "Runs inside the build, which is stuck.",
            }
          : { state: "running" as const, detail: "Runs inside the build." }),
  };

  let lint: CheckRow;
  const lintFresh = input.lint && input.lint.headSha === input.headSha;
  if (!lintFresh) {
    lint = {
      key: "lint",
      label: "Lint",
      state: "not_run",
      detail: "Not run on the latest version yet.",
      required: true,
    };
  } else {
    const files = input.lint!.files;
    const broken = files.find((f) => f.couldNotRun);
    const errors = files.reduce((n, f) => n + f.errors, 0);
    const warnings = files.reduce((n, f) => n + f.warnings, 0);
    lint = broken
      ? {
          key: "lint",
          label: "Lint",
          state: "could_not_run",
          detail: `${broken.couldNotRun}`,
          required: true,
        }
      : errors + warnings > 0
        ? {
            key: "lint",
            label: "Lint",
            // Errors in the files a change touches also fail GitHub's own
            // lint job, so they block; warnings never do. Old problems in
            // files the change doesn't touch are never counted.
            state: errors > 0 ? "failed" : "issues",
            detail:
              errors > 0
                ? `${errors} error${errors === 1 ? "" : "s"} in the changed files. The AI needs to fix ${errors === 1 ? "it" : "them"}.`
                : `${warnings} warning${warnings === 1 ? "" : "s"} in the changed files. Worth a look, doesn't block publishing.`,
            required: true,
          }
        : {
            key: "lint",
            label: "Lint",
            state: "passed",
            detail: files.length
              ? "No problems in the changed files."
              : "No code files to lint.",
            required: true,
          };
  }

  const ciWaiting = input.ciWaiting ?? [];
  const ciFailing = input.ciFailing ?? [];
  const ci: CheckRow =
    input.ci === "failure"
      ? {
          key: "ci",
          label: "GitHub checks",
          state: "failed",
          detail: `Failed: ${ciFailing.join(", ") || "a GitHub check"}. The AI can read the error with get_check_log_excerpt and fix it.`,
          required: true,
        }
      : input.ci === "pending"
        ? input.buildStuck
          ? {
              key: "ci",
              label: "GitHub checks",
              state: "timed_out",
              detail: `Still waiting after 20+ minutes: ${ciWaiting.join(", ") || "a GitHub check"}.`,
              required: true,
            }
          : {
              key: "ci",
              label: "GitHub checks",
              state: "running",
              detail: `Running: ${ciWaiting.join(", ") || "automatic tests"} (usually a few minutes).`,
              required: true,
            }
        : input.ci === "success"
          ? {
              key: "ci",
              label: "GitHub checks",
              state: "passed",
              detail:
                "Automatic tests, and lint and format of the changed files, passed.",
              required: true,
            }
          : {
              key: "ci",
              label: "GitHub checks",
              state: "not_needed",
              detail: "No automatic GitHub checks ran for this change.",
              required: false,
            };

  return [build, typecheck, lint, ci];
}

export type ReviewState =
  | "awaiting_ok"
  | "working"
  | "checking"
  | "ready"
  | "failed"
  | "stuck"
  | "published"
  | "discarded";

export const REVIEW_STATE_LABELS: Record<ReviewState, string> = {
  awaiting_ok: "Waiting for your OK",
  working: "Working",
  checking: "Checking",
  ready: "Ready for review",
  failed: "Failed",
  stuck: "Stuck",
  published: "Published",
  discarded: "Discarded",
};

export interface ReviewActions {
  preview: boolean;
  discard: boolean;
  publish: boolean;
  retry: boolean;
}

export interface ReviewOutcome {
  state: ReviewState;
  label: string;
  nextStep: string;
  actions: ReviewActions;
}

const NONE: ReviewActions = {
  preview: false,
  discard: false,
  publish: false,
  retry: false,
};

export function reviewOutcome(input: {
  status: ChangeStatus;
  checks: CheckRow[];
  hasPreview: boolean;
  // Problems that aren't checks, e.g. "Nothing has been changed yet."
  problems: string[];
}): ReviewOutcome {
  const out = (
    state: ReviewState,
    nextStep: string,
    actions: Partial<ReviewActions>,
  ): ReviewOutcome => ({
    state,
    label: REVIEW_STATE_LABELS[state],
    nextStep,
    actions: { ...NONE, ...actions },
  });
  const preview = input.hasPreview;

  if (input.status === "published") {
    return out(
      "published",
      "Nothing to do. It's live, and it can be restored from the change history if needed.",
      {},
    );
  }
  if (input.status === "discarded") {
    return out(
      "discarded",
      "Nothing to do. Nothing from this change went live.",
      {},
    );
  }
  if (input.status === "awaiting_confirmation") {
    return out(
      "awaiting_ok",
      "Check what the AI understood. Say yes to let it start, or tell it what you meant.",
      { discard: true },
    );
  }
  if (input.status === "draft") {
    return out(
      "working",
      "The AI is still making this change. Nothing to do yet.",
      { discard: true, preview },
    );
  }

  const required = input.checks.filter((c) => c.required);
  const broken = required.filter(
    (c) => c.state === "failed" || c.state === "could_not_run",
  );
  if (broken.length || input.problems.length) {
    const what = [
      ...broken.map(
        (c) =>
          `${c.label} ${c.state === "failed" ? "failed" : "could not run"}`,
      ),
      ...input.problems,
    ].join(". ");
    return out(
      "failed",
      `${what}. Ask the AI to fix it, Retry, or Discard the change.`,
      { retry: true, discard: true, preview },
    );
  }
  if (required.some((c) => c.state === "timed_out")) {
    return out(
      "stuck",
      "A check has been running far longer than normal. Retry, or Discard the change.",
      { retry: true, discard: true, preview },
    );
  }
  if (required.some((c) => c.state === "running" || c.state === "not_run")) {
    return out(
      "checking",
      preview
        ? "Checks are still running. You can open the Preview now. Publish unlocks when they pass."
        : "Checks are still running (the preview site is being built). Publish unlocks when they pass.",
      { retry: true, discard: true, preview },
    );
  }
  return out(
    "ready",
    preview
      ? "Open the Preview and look it over, then Publish or Discard."
      : "Look over what will go live below, then Publish or Discard.",
    { preview, discard: true, publish: true },
  );
}

// The plain list under "What will go live", always ending with what is NOT
// included, so the person knows only this request is going out.
export function goesLiveList(input: {
  summary: string | null;
  appliesTo: AppliesTo;
  areas: AffectedArea[];
  otherPendingCount: number;
}): string[] {
  const items: string[] = [];
  if (input.summary) items.push(input.summary);
  for (const a of input.areas)
    items.push(a.route && !a.shared ? `Page: ${a.label}` : a.label);
  if (input.areas.length)
    items.push(`Applies to: ${APPLIES_TO_LABELS[input.appliesTo]}`);
  items.push(
    input.otherPendingCount > 0
      ? `${input.otherPendingCount} other waiting change${input.otherPendingCount === 1 ? " is" : "s are"} NOT included`
      : "No other changes are included",
  );
  return items;
}
