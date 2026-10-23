import { beforeEach, describe, expect, it, vi } from "vitest";
import * as gh from "@/lib/admin/github-client";
import { lintChangedFiles } from "@/lib/admin/code-check";
import { listRecords } from "@/lib/admin/change-store";
import { waitForChecks } from "@/lib/admin/tools";
import { reviewToken } from "@/lib/admin/change-describe";
import * as cs from "@/lib/admin/change-sets";
import type { ChangeSet } from "@/lib/admin/change-sets";

// A small in-memory change store: records by key, plus every patch.
const db = vi.hoisted(() => ({ docs: new Map<string, Record<string, unknown>>(), patches: [] as { id: string; set?: object }[] }));
vi.mock("@/lib/admin/change-store", () => ({
  readRecord: vi.fn(async (key: string) => db.docs.get(key) ?? null),
  createRecord: vi.fn(async (d: Record<string, unknown>) => void db.docs.set(d.key as string, d)),
  patchRecord: vi.fn(async (key: string, set: object) => {
    db.patches.push({ id: key, set });
    const doc = db.docs.get(key);
    if (doc) Object.assign(doc, set);
  }),
  listRecords: vi.fn(async (filter: (d: Record<string, unknown>) => boolean, limit: number) =>
    [...db.docs.values()]
      .filter(filter)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, limit),
  ),
}));
vi.mock("@/lib/admin/github-client", () => ({
  GITHUB_REPO: { owner: "RRTONY", repo: "spamtoast" },
  compareToDefaultBranch: vi.fn(async () => ({ aheadBy: 1, files: [{ path: "src/app/about/page.tsx", status: "modified", additions: 1, deletions: 1 }] })),
  getPRHeadSha: vi.fn(async () => "head1"),
  getPRCombinedStatus: vi.fn(async () => "success"),
  getPRState: vi.fn(),
  mergePR: vi.fn(async () => ({ merged: true, sha: "merge1" })),
  deleteBranch: vi.fn(async () => {}),
  closePR: vi.fn(async () => {}),
  listOpenAdminPRs: vi.fn(async () => []),
  listBranches: vi.fn(async () => []),
  getCommitFiles: vi.fn(async () => ({ parentSha: "p", files: [{ path: "src/app/about/page.tsx", status: "modified", previousPath: null }] })),
  getFile: vi.fn(async () => ({ content: "x", sha: "s" })),
  errorStatus: vi.fn(() => null),
  getDefaultBranch: vi.fn(async () => "main"),
  getFileSha: vi.fn(async () => "sha"),
  createBranchWithFileStates: vi.fn(async () => {}),
  openPR: vi.fn(async () => ({ number: 12, url: "u12" })),
}));
vi.mock("@/lib/admin/tools", () => ({ waitForChecks: vi.fn(async () => ({ status: "success", build: "success", ci: "success", previewUrl: "https://deploy-preview-4--spamtoast.netlify.app", failingChecks: [] })) }));
vi.mock("@/lib/admin/code-check", () => ({ lintChangedFiles: vi.fn(async () => [{ path: "src/app/about/page.tsx", errors: 0, warnings: 0, couldNotRun: null }]) }));

const user = { name: "Tony", email: "tony@example.com", role: "write" as const };
const KEY = "20261016-abc123";

function seed(over: Partial<ChangeSet> = {}): ChangeSet {
  const c = {
    _id: `change.${KEY}`,
    key: KEY,
    title: "Fix typo",
    request: "Fix the typo on /about",
    requestedBy: { name: "Kim", email: "kim@example.com" },
    status: "ready_for_review",
    createdAt: "2026-10-16T10:00:00Z",
    branch: `admin/mcp-${KEY}`,
    prNumber: 4,
    lint: { headSha: "head1", files: [] },
    ...over,
  } as ChangeSet;
  db.docs.set(c.key, c as never);
  return c;
}

beforeEach(() => {
  db.docs.clear();
  db.patches.length = 0;
});

describe("ids and basics", () => {
  it("record ids are dotted and branches are admin/mcp-<key>", () => {
    expect(cs.changeDocId(KEY)).toBe(`change.${KEY}`);
    expect(cs.branchForChange(KEY)).toBe(`admin/mcp-${KEY}`);
  });

  it("createChangeSet trims fields and waits for an OK when the request is unclear", async () => {
    const c = await cs.createChangeSet({ title: "t".repeat(200), request: "r", user, needsConfirmation: true, appliesTo: "tablet" as never });
    expect(c.title).toHaveLength(120);
    expect(c.status).toBe("awaiting_confirmation");
    expect(c.appliesTo).toBe("both");
    expect(c._id).toBe(`change.${c.key}`);
    expect(db.docs.get(c.key)).toMatchObject({ key: c.key, requestedBy: { name: "Tony", email: "tony@example.com" } });
    expect(db.docs.get(c.key)).not.toHaveProperty("content");
  });

  it("isOpen covers the three waiting statuses", () => {
    expect(["awaiting_confirmation", "draft", "ready_for_review", "published", "discarded"].map((s) => cs.isOpen({ status: s } as ChangeSet))).toEqual([true, true, true, false, false]);
  });

  it("an edit after review sends the change back to draft", async () => {
    const c = seed();
    await cs.markEdited(c);
    expect(c.status).toBe("draft");
    expect(db.patches[0].set).toMatchObject({ status: "draft", submittedAt: null });
  });
});

describe("confirmChange", () => {
  it("moves an awaiting change to draft with the chosen scope", async () => {
    seed({ status: "awaiting_confirmation" });
    await expect(cs.confirmChange(KEY, "mobile")).resolves.toEqual({ ok: true, changeId: KEY, appliesTo: "mobile" });
    expect(db.patches[0].set).toMatchObject({ status: "draft", appliesTo: "mobile" });
  });

  it("is a no-op for an already-started change and refuses a finished one", async () => {
    seed({ status: "draft", appliesTo: "desktop" });
    await expect(cs.confirmChange(KEY, "mobile")).resolves.toEqual({ ok: true, changeId: KEY, appliesTo: "desktop" });
    seed({ status: "published" });
    await expect(cs.confirmChange(KEY, "both")).resolves.toEqual({ ok: false, error: "This change is already published." });
    await expect(cs.confirmChange("20990101-zzzzzz", "both")).resolves.toMatchObject({ ok: false });
  });
});

describe("submitForReview", () => {
  it("refuses finished, unconfirmed or empty changes", async () => {
    await expect(cs.submitForReview(seed({ status: "published" }), "s", [])).resolves.toMatchObject({ ok: false });
    await expect(cs.submitForReview(seed({ status: "awaiting_confirmation" }), "s", [])).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/hasn't confirmed/) });
    vi.mocked(gh.compareToDefaultBranch).mockResolvedValueOnce({ aheadBy: 0, files: [] });
    await expect(cs.submitForReview(seed({ status: "draft" }), "s", [])).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/Nothing has been changed/) });
  });

  it("lints the exact head and marks the change ready", async () => {
    const r = await cs.submitForReview(seed({ status: "draft" }), "Fixed the typo", [{ label: "Title", before: "Teh", after: "The" }]);
    expect(r).toMatchObject({ ok: true, status: "ready_for_review", lint: { headSha: "head1" } });
    expect(lintChangedFiles).toHaveBeenCalledWith([{ path: "src/app/about/page.tsx", content: "x" }]);
    expect(db.patches.at(-1)!.set).toMatchObject({ status: "ready_for_review", summary: "Fixed the typo", areas: ["/about page"] });
  });
});

describe("buildReview", () => {
  it("is publishable when everything passed, with a token covering the code version", async () => {
    const r = await cs.buildReview(seed(), 0);
    expect(r).toMatchObject({ state: "ready", canPublish: true, blockers: [], headSha: "head1", reviewToken: reviewToken("head1") });
    expect(r.previewLinks).toEqual([{ label: "/about page", url: "https://deploy-preview-4--spamtoast.netlify.app/about" }]);
  });

  it("is blocked while a draft or when a check failed", async () => {
    expect((await cs.buildReview(seed({ status: "draft" }), 0)).canPublish).toBe(false);
    vi.mocked(waitForChecks).mockResolvedValueOnce({ status: "failure", build: "failure", previewUrl: null, failingChecks: [] });
    const r = await cs.buildReview(seed(), 0);
    expect(r.canPublish).toBe(false);
    expect(r.blockers).toContain("Build failed.");
  });
});

describe("publishChange: refusals", () => {
  const token = () => reviewToken("head1");

  it("refuses unknown, draft and already-published changes", async () => {
    await expect(cs.publishChange("20990101-zzzzzz", "t", user)).resolves.toMatchObject({ ok: false });
    seed({ status: "draft" });
    await expect(cs.publishChange(KEY, token(), user)).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/still a draft/) });
    seed({ status: "published" });
    await expect(cs.publishChange(KEY, token(), user)).resolves.toMatchObject({ ok: false, error: "This change is already published." });
    expect(gh.mergePR).not.toHaveBeenCalled();
  });

  it("refuses when anything changed after review (token mismatch)", async () => {
    seed();
    await expect(cs.publishChange(KEY, "stale-token", user)).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/updated after it was reviewed/) });
    vi.mocked(gh.getPRHeadSha).mockResolvedValueOnce("head2");
    await expect(cs.publishChange(KEY, token(), user)).resolves.toMatchObject({ ok: false });
    expect(gh.mergePR).not.toHaveBeenCalled();
  });

  it("refuses when lint is stale or couldn't run, or the site check failed or is running", async () => {
    seed({ lint: { headSha: "old", files: [] } });
    await expect(cs.publishChange(KEY, token(), user)).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/Lint hasn't run/) });
    seed({ lint: { headSha: "head1", files: [{ path: "a", errors: 0, warnings: 0, couldNotRun: "boom" }] } });
    await expect(cs.publishChange(KEY, token(), user)).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/Lint could not run \(boom\)/) });
    seed();
    vi.mocked(gh.getPRCombinedStatus).mockResolvedValueOnce("failure");
    await expect(cs.publishChange(KEY, token(), user)).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/site check failed/) });
    vi.mocked(gh.getPRCombinedStatus).mockResolvedValueOnce("pending");
    await expect(cs.publishChange(KEY, token(), user)).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/still running/) });
    expect(gh.mergePR).not.toHaveBeenCalled();
  });

  it("maps GitHub's 409 and 405 merge refusals to plain words", async () => {
    seed();
    vi.mocked(gh.mergePR).mockRejectedValueOnce(new Error("conflict"));
    vi.mocked(gh.errorStatus).mockReturnValueOnce(409);
    await expect(cs.publishChange(KEY, token(), user)).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/updated after it was reviewed/) });
    vi.mocked(gh.mergePR).mockRejectedValueOnce(new Error("not mergeable"));
    vi.mocked(gh.errorStatus).mockReturnValueOnce(405);
    await expect(cs.publishChange(KEY, token(), user)).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/can't go live as is/) });
  });
});

describe("publishChange: success", () => {
  it("merges the reviewed head and records who did it", async () => {
    seed({ undoes: "20261001-orig01" });
    seed({ key: "20261001-orig01", status: "published" });
    const r = await cs.publishChange(KEY, reviewToken("head1"), user);
    expect(r).toEqual({ ok: true, changeId: KEY, mergeSha: "merge1" });
    expect(gh.mergePR).toHaveBeenCalledWith(4, "head1");
    expect(db.patches.find((p) => p.id === KEY && (p.set as { status?: string })?.status === "published")!.set).toMatchObject({ publishedBy: "Tony", mergeSha: "merge1" });
    expect(db.patches.find((p) => p.id === "20261001-orig01")!.set).toEqual({ undoneBy: KEY });
  });
});

describe("discardChange", () => {
  it("closes the PR, deletes the branch, and records who discarded", async () => {
    seed({ status: "draft" });
    await expect(cs.discardChange(KEY, user)).resolves.toEqual({ ok: true, changeId: KEY });
    expect(gh.closePR).toHaveBeenCalledWith(4);
    expect(gh.deleteBranch).toHaveBeenCalledWith(`admin/mcp-${KEY}`);
    expect(db.patches.at(-1)!.set).toMatchObject({ status: "discarded", discardedBy: "Tony" });
  });

  it("refuses a finished change and closes an older record-less PR", async () => {
    seed({ status: "published" });
    await expect(cs.discardChange(KEY, user)).resolves.toMatchObject({ ok: false });
    vi.mocked(gh.listOpenAdminPRs).mockResolvedValueOnce([{ number: 2, branch: "admin/mcp-20250101-old111", url: "u" }]);
    await expect(cs.discardChange("20250101-old111", user)).resolves.toEqual({ ok: true, changeId: "20250101-old111", olderChange: true });
    expect(gh.closePR).toHaveBeenCalledWith(2);
  });
});

describe("undoChange", () => {
  it("only undoes published, not-yet-undone changes", async () => {
    seed({ status: "draft" });
    await expect(cs.undoChange(KEY, user)).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/Only a published change/) });
    seed({ status: "published", undoneBy: "20261017-xyz999" });
    await expect(cs.undoChange(KEY, user)).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/already undone/) });
  });

});

describe("pending rows and history", () => {
  const rows = () =>
    cs.pendingRows(
      [
        { key: "b", title: "B", request: "rb", status: "draft", createdAt: "2026-10-16T02:00:00Z", prNumber: 5, requestedBy: { name: "Kim" } } as ChangeSet,
        { key: "a", title: "A", request: "ra", status: "ready_for_review", createdAt: "2026-10-16T01:00:00Z", prNumber: null, requestedBy: { name: "Dar" } } as ChangeSet,
        { key: "c", title: "C", request: "rc", status: "published", createdAt: "2026-10-15T01:00:00Z" } as ChangeSet,
      ],
      "x",
    );

  it("pendingRows lists only waiting changes, oldest first", () => {
    expect(rows().map((r) => [r.changeId, r.readyToPublish, r.previewUrl])).toEqual([
      ["a", true, null],
      ["b", false, "https://deploy-preview-5--spamtoast.netlify.app"],
    ]);
  });

  it("otherPendingText summarises them, or says there are none", () => {
    expect(cs.otherPendingText([])).toBe("No other pending changes.");
    expect(cs.otherPendingText(null)).toMatch(/Couldn't load/);
    expect(cs.otherPendingText(rows())).toMatch(/^- A \(change_id a\): Ready for review\. Asked by Dar/);
  });

  it("changeHistory marks only published, not-undone changes as undoable", async () => {
    vi.mocked(listRecords).mockResolvedValueOnce([
      { key: "a", title: "A", status: "published", createdAt: "t", areas: ["/about page"] },
      { key: "b", title: "B", status: "published", undoneBy: "c", createdAt: "t" },
      { key: "c", title: "C", status: "discarded", createdAt: "t" },
    ] as never);
    const h = await cs.changeHistory(10);
    expect(h.map((e) => e.canUndo)).toEqual([true, false, false]);
    expect(h[0].changed).toEqual(["/about page"]);
    expect(h[1].changed).toEqual([]);
  });

  it("pendingOverview lists PRs that belong to no change", async () => {
    vi.mocked(gh.listOpenAdminPRs).mockResolvedValueOnce([{ number: 4, branch: `admin/mcp-${KEY}`, url: "u4" }, { number: 9, branch: "admin/mcp-old", url: "u9" }]);
    const o = await cs.pendingOverview([seed()]);
    expect(o.olderChanges).toEqual([{ changeId: "old", prNumber: 9, prUrl: "u9" }]);
    expect(o.changes.map((c) => c.changeId)).toEqual([KEY]);
  });
});

describe("reconcileWithGitHub", () => {
  it("marks merged changes published and closed ones discarded", async () => {
    const merged = seed({ key: "20261016-mrg111", prNumber: 1 });
    const closed = seed({ key: "20261016-cls111", prNumber: 2 });
    const open = seed({ key: "20261016-opn111", prNumber: 3 });
    vi.mocked(gh.getPRState).mockImplementation((async (n: number) => ({ open: n === 3, merged: n === 1, mergeSha: n === 1 ? "m" : null })) as never);
    const still = await cs.reconcileWithGitHub([merged, closed, open]);
    expect(still.map((c) => c.key)).toEqual(["20261016-opn111"]);
    expect(db.patches.find((p) => p.id === "20261016-mrg111")!.set).toMatchObject({ status: "published", publishedBy: "Merged directly in GitHub" });
    expect(db.patches.find((p) => p.id === "20261016-cls111")!.set).toMatchObject({ status: "discarded" });
  });
});

describe("small record updates", () => {
  it("markEdited on a draft only stamps the edit time", async () => {
    const c = seed({ status: "draft" });
    await cs.markEdited(c);
    expect(c.status).toBe("draft");
    expect(Object.keys(db.patches[0].set!)).toEqual(["lastEditedAt"]);
    expect(c.lastEditedAt).toBe((db.patches[0].set as { lastEditedAt: string }).lastEditedAt);
  });

  it("confirmChange keeps the scope already chosen when none is given", async () => {
    seed({ status: "awaiting_confirmation", appliesTo: "desktop" });
    await expect(cs.confirmChange(KEY, "")).resolves.toEqual({ ok: true, changeId: KEY, appliesTo: "desktop" });
    seed({ status: "awaiting_confirmation", appliesTo: undefined });
    await expect(cs.confirmChange(KEY, null)).resolves.toEqual({ ok: true, changeId: KEY, appliesTo: "both" });
  });

  it("listChangeSets clamps the limit and filters by status only when asked", async () => {
    seed({ key: "20261016-pub111", status: "published" });
    seed({ key: "20261016-drf111", status: "draft" });
    await cs.listChangeSets({ limit: 1000 });
    const [allFilter, allLimit] = vi.mocked(listRecords).mock.calls[0];
    expect(allLimit).toBe(100);
    expect(allFilter({ status: "published" } as never)).toBe(true);
    expect((await cs.listOpenChangeSets()).map((c) => c.key)).toEqual(["20261016-drf111"]);
    expect(vi.mocked(listRecords).mock.calls[1][1]).toBe(100);
    await cs.listChangeSets({ limit: 0 });
    expect(vi.mocked(listRecords).mock.calls[2][1]).toBe(1);
  });

});

describe("buildReview: more cases", () => {
  it("lints the reviewed head when lint is stale, and saves it", async () => {
    const r = await cs.buildReview(seed({ lint: { headSha: "old", files: [] } }), 0);
    expect(lintChangedFiles).toHaveBeenCalledWith([{ path: "src/app/about/page.tsx", content: "x" }]);
    expect(db.patches.at(-1)!.set).toEqual({ lint: { headSha: "head1", files: [{ path: "src/app/about/page.tsx", errors: 0, warnings: 0, couldNotRun: null }] } });
    expect(r.canPublish).toBe(true);
  });

  it("blocks publish when lint couldn't run at review time", async () => {
    vi.mocked(lintChangedFiles).mockRejectedValueOnce(new Error("eslint boom"));
    const r = await cs.buildReview(seed({ lint: null }), 0);
    expect(r.checks.find((c) => c.key === "lint")!.state).toBe("could_not_run");
    expect(r.blockers).toContain("Lint could not run.");
    expect(r.canPublish).toBe(false);
    expect(db.patches).toHaveLength(0);
  });

  it("a published change is reviewed from its saved record, without GitHub", async () => {
    const r = await cs.buildReview(
      seed({ status: "published", files: [{ _key: "f", path: "src/app/about/page.tsx", status: "modified" }] }),
      2,
    );
    expect(gh.compareToDefaultBranch).not.toHaveBeenCalled();
    expect(waitForChecks).not.toHaveBeenCalled();
    expect(r.files).toEqual([{ path: "src/app/about/page.tsx", status: "modified" }]);
    expect(r.blockers).toContain("Already published.");
    expect(r.canPublish).toBe(false);
    expect(r.prUrl).toBe("https://github.com/RRTONY/spamtoast/pull/4");
  });

  it("an empty open change is blocked, and a still-pending build carries its note", async () => {
    vi.mocked(gh.compareToDefaultBranch).mockResolvedValueOnce({ aheadBy: 0, files: [] });
    vi.mocked(waitForChecks).mockResolvedValueOnce({ status: "pending", previewUrl: null, failingChecks: [], note: "Still pending after waiting ~20s." });
    const r = await cs.buildReview(seed({ lastEditedAt: new Date(Date.now() - 30 * 60_000).toISOString() }), 0);
    expect(r.blockers).toContain("Nothing has been changed yet.");
    expect(r.checkNote).toBe("Still pending after waiting ~20s.");
    expect(r.checks.find((c) => c.key === "build")!.state).toBe("timed_out");
    expect(r.canPublish).toBe(false);
  });
});

describe("submitForReview: more cases", () => {
  it("records that lint couldn't run, and trims long summaries and before/after", async () => {
    vi.mocked(lintChangedFiles).mockRejectedValueOnce(new Error("boom"));
    const r = await cs.submitForReview(seed({ status: "draft" }), "s".repeat(2000), [{ label: "L".repeat(200), before: "b", after: "a" }]);
    expect(r).toMatchObject({ ok: true, lint: { headSha: "head1", files: [{ path: "(all files)", couldNotRun: "Error: boom" }] } });
    const set = db.patches.at(-1)!.set as { summary: string; beforeAfter: { label: string }[] };
    expect(set.summary).toHaveLength(1000);
    expect(set.beforeAfter[0].label).toHaveLength(120);
  });
});

describe("publishChange: more cases", () => {
  it("refuses an empty change", async () => {
    seed({ prNumber: null, branch: null });
    await expect(cs.publishChange(KEY, reviewToken(null), user)).resolves.toEqual({ ok: false, error: "This change has nothing in it to publish." });
    expect(gh.mergePR).not.toHaveBeenCalled();
  });

  it("refuses when GitHub says it didn't merge, and rethrows unexpected merge errors", async () => {
    seed();
    vi.mocked(gh.mergePR).mockResolvedValueOnce({ merged: false, sha: null } as never);
    await expect(cs.publishChange(KEY, reviewToken("head1"), user)).resolves.toEqual({ ok: false, error: "GitHub could not merge this change." });
    vi.mocked(gh.mergePR).mockRejectedValueOnce(new Error("Server Error"));
    vi.mocked(gh.errorStatus).mockReturnValueOnce(500);
    await expect(cs.publishChange(KEY, reviewToken("head1"), user)).rejects.toThrow("Server Error");
    expect(db.patches.some((p) => (p.set as { status?: string } | undefined)?.status === "published")).toBe(false);
  });

  it("keeps going if the branch is already gone, and records the merged files", async () => {
    seed();
    vi.mocked(gh.deleteBranch).mockRejectedValueOnce(new Error("Reference does not exist"));
    const r = await cs.publishChange(KEY, reviewToken("head1"), user);
    expect(r).toEqual({ ok: true, changeId: KEY, mergeSha: "merge1" });
    expect(gh.getCommitFiles).toHaveBeenCalledWith("merge1");
    const set = db.patches.at(-1)!.set as { files: { path: string }[]; areas: string[] };
    expect(set.files.map((f) => f.path)).toEqual(["src/app/about/page.tsx"]);
    expect(set.areas).toEqual(["/about page"]);
  });

});

describe("discardChange: more cases", () => {
  it("says so when there's no record and no matching PR", async () => {
    await expect(cs.discardChange("20250101-none11", user)).resolves.toEqual({ ok: false, error: "No waiting change found with id 20250101-none11." });
    expect(gh.closePR).not.toHaveBeenCalled();
  });

});

describe("undoChange: more cases", () => {
  const published = (over: Partial<ChangeSet> = {}) => seed({ status: "published", mergeSha: "merge1", publishedAt: "2026-10-10T00:00:00Z", ...over });

  it("refuses an unknown change, and one with an undo already waiting", async () => {
    await expect(cs.undoChange("20990101-zzzzzz", user)).resolves.toEqual({ ok: false, error: "No change found with id 20990101-zzzzzz." });
    published();
    seed({ key: "20261017-und111", undoes: KEY, status: "ready_for_review", createdAt: "2026-10-17T00:00:00Z" });
    await expect(cs.undoChange(KEY, user)).resolves.toEqual({ ok: false, error: "An undo for this change is already waiting for review (20261017-und111)." });
  });

  it("refuses when a file was changed again on main since the merge", async () => {
    published();
    vi.mocked(gh.getFileSha).mockImplementation((async (_p: string, ref: string) => (ref === "main" ? "newer" : "at-merge")) as never);
    await expect(cs.undoChange(KEY, user)).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/Can't undo automatically.*\/about page/) });
    expect(gh.createBranchWithFileStates).not.toHaveBeenCalled();
  });

  it("refuses when nothing was recorded", async () => {
    published({ mergeSha: null });
    await expect(cs.undoChange(KEY, user)).resolves.toEqual({ ok: false, error: "This change has nothing recorded that can be undone." });
  });

  it("builds a new ready-for-review change that restores the files", async () => {
    vi.mocked(gh.getCommitFiles).mockResolvedValueOnce({
      parentSha: "parent1",
      files: [
        { path: "src/app/about/page.tsx", status: "modified", previousPath: null },
        { path: "src/app/new/page.tsx", status: "added", previousPath: null },
        { path: "src/app/b/page.tsx", status: "renamed", previousPath: "src/app/a/page.tsx" },
      ],
    } as never);
    vi.mocked(gh.getFileSha).mockImplementation((async (p: string, ref: string) => (ref === "parent1" ? `old-${p}` : "same")) as never);
    published({ title: "Fix typo", prNumber: 4 });

    const r = await cs.undoChange(KEY, user);
    expect(r).toMatchObject({ ok: true, title: "Undo: Fix typo" });
    if (!r.ok) throw new Error("expected ok");
    const branch = `admin/mcp-${r.changeId}`;
    expect(gh.createBranchWithFileStates).toHaveBeenCalledWith(
      branch,
      [
        { path: "src/app/about/page.tsx", sha: "old-src/app/about/page.tsx" },
        { path: "src/app/new/page.tsx", sha: null },
        { path: "src/app/b/page.tsx", sha: null },
        { path: "src/app/a/page.tsx", sha: "old-src/app/a/page.tsx" },
      ],
      'Undo "Fix typo" [by Tony]',
    );
    expect(gh.openPR).toHaveBeenCalledWith(branch, "Undo: Fix typo", `Undo of change ${KEY} (PR #4), requested by Tony via the SpamToast MCP server.`);
    const set = db.patches.at(-1)!.set as { status: string; prNumber: number; files: { path: string; status: string }[]; summary: string };
    expect(set).toMatchObject({ status: "ready_for_review", prNumber: 12, branch, summary: 'Puts things back the way they were before "Fix typo" (published 2026-10-10).' });
    expect(set.files.map((f) => f.status)).toEqual(["modified", "removed", "removed", "modified"]);
    expect(db.docs.get(r.changeId)).toMatchObject({ key: r.changeId, undoes: KEY, title: "Undo: Fix typo", status: "ready_for_review" });
  });
});

describe("pending and reconcile: more cases", () => {
  it("pendingOverview loads open changes itself when none are passed", async () => {
    vi.mocked(listRecords).mockResolvedValueOnce([{ key: "a", title: "A", status: "draft", createdAt: "t", prNumber: 3 }] as never);
    vi.mocked(gh.listOpenAdminPRs).mockResolvedValueOnce([{ number: 3, branch: "admin/mcp-a", url: "u3" }, { number: 8, branch: "admin/mcp-", url: "u8" }]);
    const o = await cs.pendingOverview();
    expect(o.changes).toEqual([{ changeId: "a", title: "A", status: "draft", statusLabel: expect.any(String), requestedBy: "Unknown", createdAt: "t" }]);
    expect(o.olderChanges).toEqual([{ changeId: null, prNumber: 8, prUrl: "u8" }]);
  });

  it("otherPendingText links the original conversation when known", () => {
    const text = cs.otherPendingText(cs.pendingRows([{ key: "a", title: "A", request: "r", status: "draft", createdAt: "2026-10-16T01:00:00Z", prNumber: null, conversationUrl: "https://claude.ai/chat/1", requestedBy: { name: "Kim" } } as ChangeSet]));
    expect(text).toContain("No preview yet | Original conversation: https://claude.ai/chat/1");
  });

  it("a PR merged in GitHub is marked published; leftover branches are deleted", async () => {
    const merged = seed({ key: "20261016-mrg222", prNumber: 1 });
    const noPr = seed({ key: "20261016-nopr22", prNumber: null });
    vi.mocked(gh.getPRState).mockResolvedValue({ open: false, merged: true, mergeSha: "m" } as never);
    vi.mocked(gh.listBranches).mockResolvedValueOnce(["admin/mcp-20261016-nopr22", "admin/mcp-stale", "admin/mcp-withpr"]);
    vi.mocked(gh.listOpenAdminPRs).mockResolvedValueOnce([{ number: 5, branch: "admin/mcp-withpr", url: "u" }]);
    const still = await cs.reconcileWithGitHub([merged, noPr]);
    expect(still.map((c) => c.key)).toEqual(["20261016-nopr22"]);
    expect(db.patches.find((p) => p.id === "20261016-mrg222")!.set).toMatchObject({ status: "published", mergeSha: "m" });
    expect(vi.mocked(gh.deleteBranch).mock.calls.map((c) => c[0])).toEqual(["admin/mcp-20261016-mrg222", "admin/mcp-stale"]);
  });

  it("a closed PR is marked discarded; a GitHub error keeps the change open and listing failures are swallowed", async () => {
    const closed = seed({ key: "20261016-cls222", prNumber: 2 });
    const flaky = seed({ key: "20261016-flk222", prNumber: 3 });
    vi.mocked(gh.getPRState).mockImplementation((async (n: number) => {
      if (n === 3) throw new Error("rate limited");
      return { open: false, merged: false, mergeSha: null };
    }) as never);
    vi.mocked(gh.listBranches).mockRejectedValueOnce(new Error("down"));
    const still = await cs.reconcileWithGitHub([closed, flaky]);
    expect(still.map((c) => c.key)).toEqual(["20261016-flk222"]);
    expect(db.patches.find((p) => p.id === "20261016-cls222")!.set).toMatchObject({ status: "discarded", discardedBy: "Closed directly in GitHub" });
  });
});
