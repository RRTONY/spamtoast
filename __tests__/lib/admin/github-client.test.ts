import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const API = "https://api.github.com/repos/RRTONY/spamtoast";
type Route = (init: RequestInit) => Response | Promise<Response>;
let routes: Record<string, Route> = {};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const calls: { url: string; init: RequestInit }[] = [];

async function load() {
  vi.resetModules();
  return import("@/lib/admin/github-client");
}

beforeEach(() => {
  calls.length = 0;
  vi.stubEnv("GITHUB_TOKEN", "ghp_test");
  routes = { [`GET ${API}`]: () => json({ default_branch: "main" }) };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      const route = routes[`${init.method ?? "GET"} ${url}`];
      return route ? route(init) : new Response("not found", { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});
const b64 = (s: string) => Buffer.from(s).toString("base64");
const body = (i: number) => JSON.parse(calls[i].init.body as string);

describe("auth and the fixed repository", () => {
  it("refuses to call GitHub without a token", async () => {
    vi.stubEnv("GITHUB_TOKEN", "");
    const gh = await load();
    await expect(gh.getDefaultBranch()).rejects.toThrow("GITHUB_TOKEN is not set");
    expect(calls).toHaveLength(0);
  });

  it("sends the token and only ever talks to RRTONY/spamtoast by default", async () => {
    const gh = await load();
    await gh.getDefaultBranch();
    expect(calls[0].url).toBe(API);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer ghp_test");
    expect(gh.GITHUB_REPO).toEqual({ owner: "RRTONY", repo: "spamtoast" });
  });

  it("takes the repo from GITHUB_REPO, and ignores a malformed value", async () => {
    vi.stubEnv("GITHUB_REPO", "acme/other-site");
    expect((await load()).GITHUB_REPO).toEqual({ owner: "acme", repo: "other-site" });
    vi.stubEnv("GITHUB_REPO", "not a repo/../x");
    expect((await load()).GITHUB_REPO).toEqual({ owner: "RRTONY", repo: "spamtoast" });
  });

  it("errorStatus and isNotFound read GitHub errors", async () => {
    const gh = await load();
    const err = await gh.compareToDefaultBranch("x").catch((e) => e);
    expect(gh.errorStatus(err)).toBe(404);
    expect(gh.isNotFound(err)).toBe(true);
    expect(gh.errorStatus(new Error("x"))).toBeNull();
  });
});

describe("files", () => {
  it("getFile decodes content and returns null for 404s and directories", async () => {
    routes[`GET ${API}/contents/src/a%20b.ts?ref=admin%2Fmcp-x`] = () => json({ type: "file", sha: "s1", content: b64("hello") });
    routes[`GET ${API}/contents/src?ref=main`] = () => json({ type: "dir", sha: "d", content: "" });
    const gh = await load();
    await expect(gh.getFile("src/a b.ts", "admin/mcp-x")).resolves.toEqual({ content: "hello", sha: "s1" });
    await expect(gh.getFile("src", "main")).resolves.toBeNull();
    await expect(gh.getFile("missing.ts", "main")).resolves.toBeNull();
  });

  it("getFile rethrows other errors", async () => {
    routes[`GET ${API}/contents/a.ts?ref=main`] = () => new Response("boom", { status: 500 });
    const gh = await load();
    await expect(gh.getFile("a.ts", "main")).rejects.toThrow(/-> 500/);
  });

  it("putFile creates a new file, or updates with the existing sha", async () => {
    routes[`PUT ${API}/contents/a.ts`] = () => json({});
    routes[`GET ${API}/contents/old.ts?ref=b`] = () => json({ type: "file", sha: "old-sha", content: b64("x") });
    routes[`PUT ${API}/contents/old.ts`] = () => json({});
    const gh = await load();
    await gh.putFile("a.ts", "héllo", "msg", "b");
    expect(body(1)).toEqual({ message: "msg", content: Buffer.from("héllo", "utf-8").toString("base64"), branch: "b" });
    await gh.putFile("old.ts", "new", "msg", "b");
    expect(body(3).sha).toBe("old-sha");
  });

  it("putFileBase64 passes binary content through unchanged", async () => {
    routes[`PUT ${API}/contents/public/a.png`] = () => json({});
    const gh = await load();
    await gh.putFileBase64("public/a.png", "iVBORw0KGgo=", "img", "b");
    expect(body(1).content).toBe("iVBORw0KGgo=");
  });

  it("deleteFile needs the file to exist", async () => {
    const gh = await load();
    await expect(gh.deleteFile("nope.ts", "m", "b")).rejects.toThrow("nope.ts does not exist on b, nothing to delete");
    routes[`GET ${API}/contents/x.ts?ref=b`] = () => json({ type: "file", sha: "xs", content: "" });
    routes[`DELETE ${API}/contents/x.ts`] = () => new Response(null, { status: 204 });
    await gh.deleteFile("x.ts", "m", "b");
    expect(body(calls.length - 1)).toEqual({ message: "m", sha: "xs", branch: "b" });
  });

  it("listDir handles the root, arrays and a single file", async () => {
    routes[`GET ${API}/contents?ref=main`] = () => json([{ path: "src", type: "dir", size: 0 }, { path: "a.md", type: "file", size: 3 }, { path: "l", type: "symlink", size: 1 }]);
    routes[`GET ${API}/contents/a.md?ref=main`] = () => json({ path: "a.md", type: "file", size: 3 });
    const gh = await load();
    await expect(gh.listDir("", "main")).resolves.toEqual([
      { path: "src", type: "dir", size: 0 },
      { path: "a.md", type: "file", size: 3 },
      { path: "l", type: "file", size: 1 },
    ]);
    await expect(gh.listDir("a.md", "main")).resolves.toHaveLength(1);
  });

  it("getFileSha returns the blob sha only for files", async () => {
    routes[`GET ${API}/contents/a.ts?ref=main`] = () => json({ type: "file", sha: "abc" });
    routes[`GET ${API}/contents/src?ref=main`] = () => json([]);
    const gh = await load();
    await expect(gh.getFileSha("a.ts", "main")).resolves.toBe("abc");
    await expect(gh.getFileSha("src", "main")).resolves.toBeNull();
    await expect(gh.getFileSha("missing", "main")).resolves.toBeNull();
  });
});

describe("branches and PRs", () => {
  it("caches the default branch and creates branches off its head", async () => {
    routes[`GET ${API}/git/ref/heads/main`] = () => json({ object: { sha: "head1" } });
    routes[`POST ${API}/git/refs`] = () => json({});
    const gh = await load();
    await gh.createBranch("admin/mcp-abc");
    await gh.getDefaultBranch();
    expect(calls.filter((c) => c.url === API)).toHaveLength(1);
    expect(body(calls.length - 1)).toEqual({ ref: "refs/heads/admin/mcp-abc", sha: "head1" });
  });

  it("falls back to main when GitHub gives no default branch", async () => {
    routes[`GET ${API}`] = () => json({});
    const gh = await load();
    await expect(gh.getDefaultBranch()).resolves.toBe("main");
  });

  it("branchExists is true/false and rethrows other errors", async () => {
    routes[`GET ${API}/git/ref/heads/admin%2Fmcp-a`] = () => json({});
    routes[`GET ${API}/git/ref/heads/boom`] = () => new Response("", { status: 500 });
    const gh = await load();
    await expect(gh.branchExists("admin/mcp-a")).resolves.toBe(true);
    await expect(gh.branchExists("admin/mcp-b")).resolves.toBe(false);
    await expect(gh.branchExists("boom")).rejects.toThrow();
  });

  it("openPR targets the default branch", async () => {
    routes[`POST ${API}/pulls`] = () => json({ number: 7, html_url: "https://github.com/pr/7" });
    const gh = await load();
    await expect(gh.openPR("admin/mcp-a", "Title", "Body")).resolves.toEqual({ number: 7, branch: "admin/mcp-a", url: "https://github.com/pr/7" });
    expect(body(1)).toEqual({ title: "Title", head: "admin/mcp-a", base: "main", body: "Body" });
  });

  it("finds and lists only admin PRs", async () => {
    const prs = [
      { number: 1, html_url: "u1", head: { ref: "feature/x" } },
      { number: 2, html_url: "u2", head: { ref: "admin/mcp-a" } },
      { number: 3, html_url: "u3", head: { ref: "admin/mcp-b" } },
    ];
    routes[`GET ${API}/pulls?state=open&base=main`] = () => json(prs);
    routes[`GET ${API}/pulls?state=open&base=main&per_page=100`] = () => json(prs);
    const gh = await load();
    await expect(gh.findOpenAdminPR("admin/mcp-")).resolves.toEqual({ number: 2, branch: "admin/mcp-a", url: "u2" });
    await expect(gh.listOpenAdminPRs("admin/mcp-")).resolves.toEqual([
      { number: 2, branch: "admin/mcp-a", url: "u2" },
      { number: 3, branch: "admin/mcp-b", url: "u3" },
    ]);
  });

  it("getPRState reports a merge sha only when merged", async () => {
    routes[`GET ${API}/pulls/5`] = () => json({ state: "closed", merged: true, merge_commit_sha: "m1", head: { sha: "h" } });
    routes[`GET ${API}/pulls/6`] = () => json({ state: "open", merged: false, merge_commit_sha: "test-merge", head: { sha: "h6" } });
    const gh = await load();
    await expect(gh.getPRState(5)).resolves.toEqual({ open: false, merged: true, mergeSha: "m1" });
    await expect(gh.getPRState(6)).resolves.toEqual({ open: true, merged: false, mergeSha: null });
    await expect(gh.getPRHeadSha(6)).resolves.toBe("h6");
  });

  it("mergePR squashes and pins the reviewed head sha", async () => {
    routes[`PUT ${API}/pulls/5/merge`] = () => json({ merged: true, sha: "sq" });
    const gh = await load();
    await expect(gh.mergePR(5, "reviewed")).resolves.toEqual({ merged: true, sha: "sq" });
    expect(body(0)).toEqual({ merge_method: "squash", sha: "reviewed" });
    await gh.mergePR(5);
    expect(body(1)).toEqual({ merge_method: "squash" });
  });

  it("closePR, deleteBranch and listBranches", async () => {
    routes[`PATCH ${API}/pulls/5`] = () => json({});
    routes[`DELETE ${API}/git/refs/heads/admin%2Fmcp-a`] = () => new Response(null, { status: 204 });
    routes[`GET ${API}/git/matching-refs/heads/admin/mcp-`] = () => json([{ ref: "refs/heads/admin/mcp-a" }]);
    const gh = await load();
    await gh.closePR(5);
    expect(body(0)).toEqual({ state: "closed" });
    await gh.deleteBranch("admin/mcp-a");
    await expect(gh.listBranches("admin/mcp-")).resolves.toEqual(["admin/mcp-a"]);
  });

  it("compareToDefaultBranch maps files", async () => {
    routes[`GET ${API}/compare/main...admin%2Fmcp-a`] = () => json({ ahead_by: 2, files: [{ filename: "a.ts", status: "modified", additions: 1, deletions: 0 }] });
    const gh = await load();
    await expect(gh.compareToDefaultBranch("admin/mcp-a")).resolves.toEqual({ aheadBy: 2, files: [{ path: "a.ts", status: "modified", additions: 1, deletions: 0 }] });
  });

  it("getCommitFiles needs a parent", async () => {
    routes[`GET ${API}/commits/c1`] = () => json({ parents: [{ sha: "p1" }], files: [{ filename: "b.ts", status: "renamed", previous_filename: "a.ts" }] });
    routes[`GET ${API}/commits/root`] = () => json({ parents: [] });
    const gh = await load();
    await expect(gh.getCommitFiles("c1")).resolves.toEqual({ parentSha: "p1", files: [{ path: "b.ts", status: "renamed", previousPath: "a.ts" }] });
    await expect(gh.getCommitFiles("root")).rejects.toThrow("Commit root has no parent to restore from");
  });

  it("createBranchWithFileStates builds one commit setting or removing each file", async () => {
    routes[`GET ${API}/git/ref/heads/main`] = () => json({ object: { sha: "head" } });
    routes[`GET ${API}/git/commits/head`] = () => json({ tree: { sha: "tree0" } });
    routes[`POST ${API}/git/trees`] = () => json({ sha: "tree1" });
    routes[`POST ${API}/git/commits`] = () => json({ sha: "commit1" });
    routes[`POST ${API}/git/refs`] = () => json({});
    const gh = await load();
    await gh.createBranchWithFileStates("admin/mcp-undo", [{ path: "a.ts", sha: "old" }, { path: "new.ts", sha: null }], "Undo");
    const tree = JSON.parse(calls.find((c) => c.url.endsWith("/git/trees"))!.init.body as string);
    expect(tree).toEqual({ base_tree: "tree0", tree: [{ path: "a.ts", mode: "100644", type: "blob", sha: "old" }, { path: "new.ts", mode: "100644", type: "blob", sha: null }] });
    expect(body(calls.length - 1)).toEqual({ ref: "refs/heads/admin/mcp-undo", sha: "commit1" });
  });
});

describe("checks", () => {
  const setPR = (status: object | null, runs: object[], comments: object[] = []) => {
    routes[`GET ${API}/pulls/9`] = () => json({ head: { sha: "h9" } });
    routes[`GET ${API}/commits/h9/status`] = () => (status ? json(status) : new Response("", { status: 500 }));
    routes[`GET ${API}/commits/h9/check-runs`] = () => json({ check_runs: runs });
    routes[`GET ${API}/issues/9/comments`] = () => json(comments);
  };

  it("combined status: failure beats pending beats success; neutral/skipped pass", async () => {
    const gh = await load();
    setPR({ state: "success" }, [{ status: "completed", conclusion: "skipped" }]);
    await expect(gh.getPRCombinedStatus(9)).resolves.toBe("success");
    setPR({ state: "success" }, [{ status: "in_progress", conclusion: null }]);
    await expect(gh.getPRCombinedStatus(9)).resolves.toBe("pending");
    setPR({ state: "pending" }, [{ status: "completed", conclusion: "timed_out" }]);
    await expect(gh.getPRCombinedStatus(9)).resolves.toBe("failure");
    setPR({ state: "weird" }, []);
    await expect(gh.getPRCombinedStatus(9)).resolves.toBe("unknown");
    setPR(null, []);
    await expect(gh.getPRCombinedStatus(9)).resolves.toBe("unknown");
  });

  it("detail splits Netlify build from CI, lists failures and finds the preview URL", async () => {
    setPR(
      { state: "success", statuses: [{ context: "netlify/spamtoast/deploy-preview", state: "success" }] },
      [
        { id: 1, name: "Header rules - spamtoast", status: "completed", conclusion: "success", html_url: "n" },
        { id: 2, name: "lint", status: "completed", conclusion: "failure", html_url: "https://gh/run/2" },
        { id: 3, name: "tests", status: "queued", conclusion: null, html_url: "t" },
      ],
      [{ body: "no link" }, { body: "Deploy Preview ready: https://deploy-preview-9--spamtoast.netlify.app !" }],
    );
    const gh = await load();
    await expect(gh.getPRChecksDetail(9)).resolves.toEqual({
      status: "failure",
      previewUrl: "https://deploy-preview-9--spamtoast.netlify.app",
      failingChecks: [{ id: 2, name: "lint", url: "https://gh/run/2" }],
      build: "success",
      ci: "failure",
      ciWaiting: ["tests"],
      ciFailing: ["lint"],
    });
  });

  it("truncateLogTail keeps the last 200 lines, at most 8000 chars", async () => {
    const gh = await load();
    const lines = Array.from({ length: 300 }, (_, i) => `line ${i}`).join("\n");
    const tail = gh.truncateLogTail(lines);
    expect(tail.split("\n")).toHaveLength(200);
    expect(tail.startsWith("line 100")).toBe(true);
    expect(gh.truncateLogTail("x".repeat(9000))).toHaveLength(8000);
  });

  it("getFailingCheckLogExcerpt returns the tail or throws with the status", async () => {
    routes[`GET ${API}/actions/jobs/2/logs`] = () => new Response("a\nb\nError: lint failed");
    const gh = await load();
    await expect(gh.getFailingCheckLogExcerpt(2)).resolves.toBe("a\nb\nError: lint failed");
    const err = await gh.getFailingCheckLogExcerpt(3).catch((e) => e);
    expect(gh.errorStatus(err)).toBe(404);
  });
});

// A minimal ustar entry: name at 0, octal size at 124, type at 156, prefix
// at 345. readTarTextFiles doesn't check the checksum, so it is left blank.
function tarEntry(name: string, content: string | Buffer, type = "0", prefix = "") {
  const data = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const header = Buffer.alloc(512);
  header.write(name, 0);
  header.write(data.length.toString(8).padStart(11, "0"), 124);
  header.write(type, 156);
  if (prefix) header.write(prefix, 345);
  return Buffer.concat([header, data, Buffer.alloc(Math.ceil(data.length / 512) * 512 - data.length)]);
}
const tar = (...entries: Buffer[]) => Buffer.concat([...entries, Buffer.alloc(1024)]);

describe("repo search helpers", () => {
  it("listAllFiles returns only files (not folders) at the given ref", async () => {
    routes[`GET ${API}/git/trees/admin%2Fmcp-x?recursive=1`] = () =>
      json({ tree: [{ path: "src", type: "tree" }, { path: "src/a.ts", type: "blob" }, { path: "README.md", type: "blob" }] });
    const gh = await load();
    await expect(gh.listAllFiles("admin/mcp-x")).resolves.toEqual(["src/a.ts", "README.md"]);
  });

  it("listAllFiles copes with an empty answer", async () => {
    routes[`GET ${API}/git/trees/main?recursive=1`] = () => json({});
    const gh = await load();
    await expect(gh.listAllFiles("main")).resolves.toEqual([]);
  });

  it("readTarTextFiles strips GitHub's wrapper folder and skips folders, binaries and pax headers", async () => {
    const gh = await load();
    const files = gh.readTarTextFiles(
      tar(
        tarEntry("pax_global_header", "52 comment=abc\n", "g"),
        tarEntry("RRTONY-site-abc/", "", "5"),
        tarEntry("RRTONY-site-abc/src/a.ts", "export const a = 1;\n"),
        tarEntry("RRTONY-site-abc/logo.png", Buffer.from([0x89, 0x50, 0x00, 0x01])),
        tarEntry("page.tsx", "<p>hi</p>", "", "RRTONY-site-abc/src/app"),
      ),
    );
    expect(files).toEqual([
      { path: "src/a.ts", content: "export const a = 1;\n" },
      { path: "src/app/page.tsx", content: "<p>hi</p>" },
    ]);
  });

  it("readTarTextFiles uses a pax long path for the next entry only", async () => {
    const gh = await load();
    const long = `RRTONY-site-abc/${"d/".repeat(60)}long.ts`;
    const record = `${long.length + 10} path=${long}\n`;
    const files = gh.readTarTextFiles(
      tar(
        tarEntry("PaxHeader", record, "x"),
        tarEntry("RRTONY-site-abc/truncated", "long file"),
        tarEntry("RRTONY-site-abc/next.ts", "next"),
      ),
    );
    expect(files.map((f) => f.path)).toEqual([`${"d/".repeat(60)}long.ts`, "next.ts"]);
  });

  it("readTarTextFiles skips files over 512 KB and stops at the end marker", async () => {
    const gh = await load();
    const big = tarEntry("RRTONY-site-abc/big.txt", "x".repeat(512 * 1024 + 1));
    expect(gh.readTarTextFiles(tar(big, tarEntry("RRTONY-site-abc/ok.txt", "ok")))).toEqual([{ path: "ok.txt", content: "ok" }]);
    expect(gh.readTarTextFiles(Buffer.alloc(0))).toEqual([]);
  });

  it("getRepoTextFiles downloads the gzipped tarball with the token", async () => {
    const { gzipSync } = await import("node:zlib");
    const archive = gzipSync(tar(tarEntry("RRTONY-site-abc/a.md", "# A")));
    routes[`GET ${API}/tarball/main`] = () => new Response(archive, { status: 200 });
    const gh = await load();
    await expect(gh.getRepoTextFiles("main")).resolves.toEqual([{ path: "a.md", content: "# A" }]);
    expect((calls.at(-1)!.init.headers as Record<string, string>).Authorization).toBe("Bearer ghp_test");
  });

  it("getRepoTextFiles reports a failed download", async () => {
    routes[`GET ${API}/tarball/main`] = () => new Response("nope", { status: 403 });
    const gh = await load();
    await expect(gh.getRepoTextFiles("main")).rejects.toMatchObject({ status: 403, message: "GitHub tarball main -> 403" });
  });
});
