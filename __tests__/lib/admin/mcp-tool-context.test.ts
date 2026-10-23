import { describe, expect, it, vi } from "vitest";
import * as gh from "@/lib/admin/github-client";
import { patchChangeSet, type ChangeSet } from "@/lib/admin/change-sets";
import { buildMcpToolContext } from "@/lib/admin/mcp-tool-context";

vi.mock("@/lib/admin/github-client", () => ({
  getDefaultBranch: vi.fn(async () => "main"),
  createBranch: vi.fn(async () => {}),
  openPR: vi.fn(),
  errorStatus: vi.fn(() => null),
  GITHUB_REPO: { owner: "RRTONY", repo: "spamtoast" },
}));
vi.mock("@/lib/admin/change-sets", () => ({
  branchForChange: (key: string) => `admin/mcp-${key}`,
  patchChangeSet: vi.fn(async () => {}),
}));

function change(over: Partial<ChangeSet> = {}): ChangeSet {
  return { key: "abc123", title: "Fix typo", request: "Fix the typo on /about", requestedBy: { name: "Kim", email: "k@x.com" }, branch: null, prNumber: null, ...over } as ChangeSet;
}

describe("buildMcpToolContext without a change (read-only)", () => {
  it("reads from the default branch, asked for once", async () => {
    const { ctx } = await buildMcpToolContext(null);
    await expect(ctx.getReadBranch()).resolves.toBe("main");
    await ctx.getReadBranch();
    expect(gh.getDefaultBranch).toHaveBeenCalledTimes(1);
  });

  it("refuses to write", async () => {
    const { ctx } = await buildMcpToolContext(null);
    await expect(ctx.ensureWriteBranch()).rejects.toThrow(/Start a change first/);
    expect(gh.createBranch).not.toHaveBeenCalled();
  });

  it("finalize reports nothing", async () => {
    const { finalize } = await buildMcpToolContext(null);
    await expect(finalize()).resolves.toEqual({ branch: null, prNumber: null, prUrl: null });
  });
});

describe("buildMcpToolContext with a change", () => {
  it("creates the change's own branch on first write, once, and saves it", async () => {
    const c = change();
    const { ctx, auditLog } = await buildMcpToolContext(c);
    await expect(ctx.ensureWriteBranch()).resolves.toBe("admin/mcp-abc123");
    await ctx.ensureWriteBranch();
    expect(gh.createBranch).toHaveBeenCalledTimes(1);
    expect(patchChangeSet).toHaveBeenCalledWith("abc123", { branch: "admin/mcp-abc123" });
    expect(c.branch).toBe("admin/mcp-abc123");
    expect(auditLog).toContain("Created branch admin/mcp-abc123");
    await expect(ctx.getReadBranch()).resolves.toBe("admin/mcp-abc123");
  });

  it("reuses an existing branch and PR", async () => {
    const { ctx, finalize } = await buildMcpToolContext(change({ branch: "admin/mcp-abc123", prNumber: 9 }));
    await expect(ctx.ensureWriteBranch()).resolves.toBe("admin/mcp-abc123");
    await expect(ctx.getPRNumber()).resolves.toBe(9);
    expect(gh.createBranch).not.toHaveBeenCalled();
    await expect(finalize()).resolves.toEqual({ branch: "admin/mcp-abc123", prNumber: 9, prUrl: "https://github.com/RRTONY/spamtoast/pull/9" });
    expect(gh.openPR).not.toHaveBeenCalled();
  });

  it("opens the PR after the first commit and saves its number", async () => {
    vi.mocked(gh.openPR).mockResolvedValue({ number: 12, branch: "admin/mcp-abc123", url: "https://github.com/x/pull/12" });
    const c = change({ branch: "admin/mcp-abc123" });
    const { finalize, auditLog } = await buildMcpToolContext(c);
    await expect(finalize()).resolves.toEqual({ branch: "admin/mcp-abc123", prNumber: 12, prUrl: "https://github.com/x/pull/12" });
    const [, title, body] = vi.mocked(gh.openPR).mock.calls[0];
    expect(title).toBe("Fix typo");
    expect(body).toContain("Requested by Kim");
    expect(body).toContain("change abc123");
    expect(patchChangeSet).toHaveBeenCalledWith("abc123", { prNumber: 12 });
    expect(c.prNumber).toBe(12);
    expect(auditLog).toContain("Opened PR #12");
  });

  it("waits quietly when GitHub says the branch has no commits yet (422)", async () => {
    vi.mocked(gh.openPR).mockRejectedValue(new Error("no diff"));
    vi.mocked(gh.errorStatus).mockReturnValue(422);
    const { finalize } = await buildMcpToolContext(change({ branch: "admin/mcp-abc123" }));
    await expect(finalize()).resolves.toEqual({ branch: "admin/mcp-abc123", prNumber: null, prUrl: null });
    expect(patchChangeSet).not.toHaveBeenCalled();
  });

  it("rethrows any other GitHub error", async () => {
    vi.mocked(gh.openPR).mockRejectedValue(new Error("boom"));
    vi.mocked(gh.errorStatus).mockReturnValue(500);
    const { finalize } = await buildMcpToolContext(change({ branch: "admin/mcp-abc123" }));
    await expect(finalize()).rejects.toThrow("boom");
  });

});
