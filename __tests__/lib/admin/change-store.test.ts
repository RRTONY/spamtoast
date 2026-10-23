import { beforeEach, describe, expect, it, vi } from "vitest";
import * as gh from "@/lib/admin/github-client";
import { createRecord, listRecords, patchRecord, readRecord, resetChangeStoreCache } from "@/lib/admin/change-store";

// A fake GitHub branch: files by path, on the change-log branch only.
const repo = vi.hoisted(() => ({ files: new Map<string, string>(), branches: new Set<string>(), conflictOnce: false }));
vi.mock("@/lib/admin/github-client", () => ({
  branchExists: vi.fn(async (b: string) => repo.branches.has(b)),
  createBranch: vi.fn(async (b: string) => void repo.branches.add(b)),
  getFile: vi.fn(async (p: string) => (repo.files.has(p) ? { content: repo.files.get(p)!, sha: "s" } : null)),
  putFile: vi.fn(async (p: string, content: string) => {
    if (repo.conflictOnce) {
      repo.conflictOnce = false;
      throw Object.assign(new Error("409"), { status: 409 });
    }
    repo.files.set(p, content);
  }),
  listDir: vi.fn(async (dir: string) => [...repo.files.keys()].filter((p) => p.startsWith(`${dir}/`)).map((path) => ({ path, type: "file", size: 1 }))),
  errorStatus: vi.fn((err: unknown) => (err as { status?: number }).status ?? null),
  isNotFound: vi.fn((err: unknown) => (err as { status?: number }).status === 404),
}));

const rec = (key: string, over: Record<string, unknown> = {}) => ({ key, createdAt: `${key}T`, status: "draft", ...over });

beforeEach(() => {
  repo.files.clear();
  repo.branches.clear();
  repo.conflictOnce = false;
  resetChangeStoreCache();
});

describe("change-store", () => {
  it("creates the change-log branch once, then writes each record as JSON on it", async () => {
    await createRecord(rec("20261024-aaaaaa"));
    await createRecord(rec("20261024-bbbbbb"));
    expect(gh.createBranch).toHaveBeenCalledTimes(1);
    expect(gh.createBranch).toHaveBeenCalledWith("mcp-change-log");
    expect(vi.mocked(gh.putFile).mock.calls[0]).toEqual(["changes/20261024-aaaaaa.json", expect.stringMatching(/"key": "20261024-aaaaaa"/), "Change 20261024-aaaaaa: created", "mcp-change-log"]);
    await expect(readRecord("20261024-aaaaaa")).resolves.toMatchObject({ key: "20261024-aaaaaa", status: "draft" });
  });

  it("tolerates another request creating the branch first, and rethrows other failures", async () => {
    vi.mocked(gh.createBranch).mockRejectedValueOnce(Object.assign(new Error("exists"), { status: 422 }));
    await expect(readRecord("x")).resolves.toBeNull();
    resetChangeStoreCache();
    vi.mocked(gh.createBranch).mockRejectedValueOnce(Object.assign(new Error("down"), { status: 500 }));
    await expect(readRecord("x")).rejects.toThrow("down");
  });

  it("returns null for a missing or corrupt record", async () => {
    repo.branches.add("mcp-change-log");
    await expect(readRecord("20261024-nope00")).resolves.toBeNull();
    repo.files.set("changes/20261024-bad000.json", "{not json");
    await expect(readRecord("20261024-bad000")).resolves.toBeNull();
  });

  it("patches by merging fields, retrying once on a stale write", async () => {
    await createRecord(rec("20261024-aaaaaa"));
    repo.conflictOnce = true;
    await patchRecord("20261024-aaaaaa", { status: "published" });
    await expect(readRecord("20261024-aaaaaa")).resolves.toMatchObject({ status: "published", createdAt: "20261024-aaaaaaT" });
    await expect(patchRecord("20261024-none00", { status: "x" })).rejects.toThrow("No change record 20261024-none00.");
  });

  it("gives up after a second stale write, and rethrows other write errors", async () => {
    await createRecord(rec("20261024-aaaaaa"));
    vi.mocked(gh.putFile).mockRejectedValueOnce(Object.assign(new Error("409"), { status: 409 })).mockRejectedValueOnce(Object.assign(new Error("409 again"), { status: 409 }));
    await expect(patchRecord("20261024-aaaaaa", { status: "x" })).rejects.toThrow("409 again");
    vi.mocked(gh.putFile).mockRejectedValueOnce(Object.assign(new Error("boom"), { status: 500 }));
    await expect(patchRecord("20261024-aaaaaa", { status: "x" })).rejects.toThrow("boom");
  });

  it("lists newest first, filtered and capped", async () => {
    for (const k of ["20261020-aaaaaa", "20261022-bbbbbb", "20261024-cccccc"]) await createRecord(rec(k, { status: k.endsWith("b") ? "published" : "draft" }));
    repo.files.set("changes/readme.txt", "x");
    const drafts = await listRecords<ReturnType<typeof rec>>((d) => d.status === "draft", 10);
    expect(drafts.map((d) => d.key)).toEqual(["20261024-cccccc", "20261020-aaaaaa"]);
    expect((await listRecords<ReturnType<typeof rec>>(() => true, 1)).map((d) => d.key)).toEqual(["20261024-cccccc"]);
  });

  it("lists nothing when the folder doesn't exist yet, and rethrows other errors", async () => {
    vi.mocked(gh.listDir).mockRejectedValueOnce(Object.assign(new Error("404"), { status: 404 }));
    await expect(listRecords(() => true, 5)).resolves.toEqual([]);
    vi.mocked(gh.listDir).mockRejectedValueOnce(Object.assign(new Error("500"), { status: 500 }));
    await expect(listRecords(() => true, 5)).rejects.toThrow("500");
  });
});
