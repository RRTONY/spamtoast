import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as gh from "@/lib/admin/github-client";
import { checkLighthouse } from "@/lib/admin/lighthouse-check";
import { checkPageSeo } from "@/lib/admin/seo-check";
import { checkCode } from "@/lib/admin/code-check";
import {
  ADMIN_TOOLS,
  normalizeRepoPath,
  applyTextEdits,
  searchRepoFiles,
  runAdminTool,
  waitForChecks,
  type AdminToolContext,
} from "@/lib/admin/tools";
import { verifyConfrontParams } from "@/lib/spam/confront-link";
import { WALL_OF_SHAME } from "@/lib/content/wall-of-shame";
import { READ_ONLY_TOOLS } from "@/lib/admin/mcp-auth";
import { RULES_GATED_TOOLS } from "@/lib/admin/project-rules";

vi.mock("@/lib/admin/github-client", () => ({
  listDir: vi.fn(async () => []),
  getFile: vi.fn(async () => ({ content: "file body", sha: "s" })),
  putFile: vi.fn(async () => {}),
  putFileBase64: vi.fn(async () => {}),
  deleteFile: vi.fn(async () => {}),
  getPRChecksDetail: vi.fn(),
  getFailingCheckLogExcerpt: vi.fn(async () => "log tail"),
  getRepoTextFiles: vi.fn(async () => []),
}));
vi.mock("@/lib/admin/seo-check", () => ({ checkPageSeo: vi.fn(async (p: string) => ({ url: p })) }));
vi.mock("@/lib/admin/code-check", () => ({ checkCode: vi.fn(async () => ({ eslint: { errorCount: 0 }, patternIssues: [] })) }));
vi.mock("@/lib/admin/lighthouse-check", () => ({ checkLighthouse: vi.fn(async () => ({ ok: 1 })) }));
vi.mock("@/lib/content/wall-of-shame", async (orig) => ({
  ...(await orig<typeof import("@/lib/content/wall-of-shame")>()),
  WALL_OF_SHAME: [] as unknown[],
}));

function makeCtx(over: Partial<AdminToolContext> = {}): AdminToolContext {
  return {
    getReadBranch: vi.fn(async () => "main"),
    ensureWriteBranch: vi.fn(async () => "admin/mcp-20261016-abc123"),
    getPRNumber: vi.fn(async () => null),
    log: vi.fn(),
    ...over,
  };
}
let ctx: AdminToolContext;
beforeEach(() => {
  ctx = makeCtx();
});

describe("tool list", () => {
  it("every tool has a unique name, a description and an object input schema", () => {
    const names = ADMIN_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of ADMIN_TOOLS) {
      expect(t.description.length, t.name).toBeGreaterThan(10);
      expect(t.input_schema.type).toBe("object");
    }
  });

  it("every tool that writes is rules-gated and not read-only", () => {
    for (const name of ["github_write_file", "github_edit_file", "github_delete_file", "github_write_binary_file", "add_to_wall_of_shame"]) {
      expect(ADMIN_TOOLS.some((t) => t.name === name), name).toBe(true);
      expect(RULES_GATED_TOOLS.has(name), name).toBe(true);
      expect(READ_ONLY_TOOLS.has(name), name).toBe(false);
    }
  });

  it("every tool is classified: read-only or rules-gated", () => {
    for (const t of ADMIN_TOOLS) expect(READ_ONLY_TOOLS.has(t.name) || RULES_GATED_TOOLS.has(t.name), t.name).toBe(true);
  });
});

describe("normalizeRepoPath", () => {
  it("strips quotes, ./ and slashes, and maps root placeholders to ''", () => {
    expect(normalizeRepoPath('"src/app"')).toBe("src/app");
    expect(normalizeRepoPath(`'"./src/app/"'`)).toBe("src/app");
    expect(normalizeRepoPath("/src/app")).toBe("src/app");
    for (const root of ['""', ".", "/", "ROOT", "", null, undefined]) expect(normalizeRepoPath(root)).toBe("");
  });
});

describe("repo file tools", () => {
  it("reads from the context's read branch", async () => {
    await expect(runAdminTool("github_read_file", { path: "src/app/page.tsx" }, ctx)).resolves.toEqual({ output: { content: "file body" } });
    expect(gh.getFile).toHaveBeenCalledWith("src/app/page.tsx", "main");
  });

  it("refuses to read secrets and admin code, but allows read-only build files", async () => {
    for (const path of [".env.local", "/src/lib/admin/mcp-auth.ts", "./pnpm-lock.yaml"]) {
      const r = await runAdminTool("github_read_file", { path }, ctx);
      expect(r.isError, path).toBe(true);
      expect(String((r.output as { error: string }).error)).toMatch(/off-limits/);
    }
    expect(gh.getFile).not.toHaveBeenCalled();
    expect((await runAdminTool("github_read_file", { path: "package.json" }, ctx)).isError).toBeUndefined();
  });

  it("reports a missing file and a missing path", async () => {
    vi.mocked(gh.getFile).mockResolvedValue(null);
    expect(await runAdminTool("github_read_file", { path: "nope.ts" }, ctx)).toEqual({ output: { error: "nope.ts does not exist" }, isError: true });
    expect((await runAdminTool("github_read_file", { path: "" }, ctx)).isError).toBe(true);
  });

  it("writes only to the change's own branch and logs it", async () => {
    const r = await runAdminTool("github_write_file", { path: "src/app/about/page.tsx", content: "x", message: "Fix typo" }, ctx);
    expect(r).toEqual({ output: { ok: true, path: "src/app/about/page.tsx", branch: "admin/mcp-20261016-abc123" } });
    expect(gh.putFile).toHaveBeenCalledWith("src/app/about/page.tsx", "x", "Fix typo", "admin/mcp-20261016-abc123");
    expect(ctx.log).toHaveBeenCalledWith(expect.stringContaining("Wrote src/app/about/page.tsx"));
  });

  it.each(["github_write_file", "github_delete_file", "github_write_binary_file"])("%s refuses denied paths before touching a branch", async (tool) => {
    for (const path of ["package.json", "src/proxy.ts", ".github/workflows/ci.yml", "netlify.toml", "src/lib/admin/tools.ts", "/.env"]) {
      const r = await runAdminTool(tool, { path, content: "x", base64Content: "AAAA" }, ctx);
      expect(r.isError, `${tool} ${path}`).toBe(true);
    }
    expect(ctx.ensureWriteBranch).not.toHaveBeenCalled();
    expect(gh.putFile).not.toHaveBeenCalled();
    expect(gh.deleteFile).not.toHaveBeenCalled();
  });

  it("a write fails when no change was started", async () => {
    ctx = makeCtx({ ensureWriteBranch: vi.fn(async () => { throw new Error("Start a change first"); }) });
    await expect(runAdminTool("github_write_file", { path: "a.ts", content: "x" }, ctx)).rejects.toThrow("Start a change first");
    expect(gh.putFile).not.toHaveBeenCalled();
  });

  it("binary writes check the bytes match the file type", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]).toString("base64");
    const ok = await runAdminTool("github_write_binary_file", { path: "public/a.png", base64Content: png }, ctx);
    expect(ok.output).toMatchObject({ ok: true, sizeBytes: 9 });
    expect(gh.putFileBase64).toHaveBeenCalledWith("public/a.png", png, "MCP binary upload", "admin/mcp-20261016-abc123");
    const bad = await runAdminTool("github_write_binary_file", { path: "public/b.png", base64Content: Buffer.from("<html>").toString("base64") }, ctx);
    expect(bad.isError).toBe(true);
    expect(gh.putFileBase64).toHaveBeenCalledTimes(1);
  });
});

describe("checks", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("check_pr_status says so when there's no PR", async () => {
    expect((await runAdminTool("check_pr_status", {}, ctx)).output).toMatchObject({ status: "no_pending_change" });
  });

  it("waitForChecks polls while pending, then gives up with a note", async () => {
    vi.useFakeTimers();
    vi.mocked(gh.getPRChecksDetail).mockResolvedValue({ status: "pending", previewUrl: null, failingChecks: [] });
    const p = waitForChecks(4);
    await vi.advanceTimersByTimeAsync(25_000);
    const r = await p;
    expect(r.note).toMatch(/Still pending after waiting ~\d+s/);
    expect(vi.mocked(gh.getPRChecksDetail).mock.calls.length).toBeGreaterThan(2);
  });

  it("waitForChecks returns as soon as checks finish", async () => {
    vi.mocked(gh.getPRChecksDetail).mockResolvedValue({ status: "success", previewUrl: null, failingChecks: [] });
    await expect(waitForChecks(4)).resolves.toEqual({ status: "success", previewUrl: null, failingChecks: [] });
    expect(gh.getPRChecksDetail).toHaveBeenCalledTimes(1);
  });

  it("get_check_log_excerpt needs a number", async () => {
    expect((await runAdminTool("get_check_log_excerpt", { checkRunId: "abc" }, ctx)).isError).toBe(true);
    expect((await runAdminTool("get_check_log_excerpt", { checkRunId: "12" }, ctx)).output).toEqual({ log: "log tail" });
  });

  it("defaults lighthouse to mobile and turns its errors into tool errors", async () => {
    await runAdminTool("lighthouse_check_page", { path: "/x", strategy: "tablet" }, ctx);
    expect(checkLighthouse).toHaveBeenCalledWith("/x", "mobile");
    vi.mocked(checkLighthouse).mockRejectedValueOnce(new Error("GOOGLE_API_KEY is not configured"));
    await expect(runAdminTool("lighthouse_check_page", {}, ctx)).resolves.toEqual({ output: { error: "GOOGLE_API_KEY is not configured" }, isError: true });
  });

  it("unknown tools are refused", async () => {
    await expect(runAdminTool("rm_rf", {}, ctx)).resolves.toEqual({ output: { error: 'Unknown tool "rm_rf"' }, isError: true });
  });
});

describe("more repo file tools", () => {
  it("github_list_dir normalises the path and lists from the read branch", async () => {
    vi.mocked(gh.listDir).mockResolvedValue([{ name: "app", type: "dir" }] as never);
    await expect(runAdminTool("github_list_dir", { path: '"./src/"' }, ctx)).resolves.toEqual({ output: [{ name: "app", type: "dir" }] });
    expect(gh.listDir).toHaveBeenCalledWith("src", "main");
    await runAdminTool("github_list_dir", { path: "ROOT" }, ctx);
    expect(gh.listDir).toHaveBeenLastCalledWith("", "main");
  });

  it("github_write_file needs a path and defaults the commit message", async () => {
    expect(await runAdminTool("github_write_file", { path: "/", content: "x" }, ctx)).toEqual({ output: { error: "A repo-relative file path is required." }, isError: true });
    expect(ctx.ensureWriteBranch).not.toHaveBeenCalled();
    await runAdminTool("github_write_file", { path: "src/a.ts" }, ctx);
    expect(gh.putFile).toHaveBeenCalledWith("src/a.ts", "", "MCP edit", "admin/mcp-20261016-abc123");
  });

  it("github_delete_file deletes on the change's branch with a default message, and needs a path", async () => {
    expect((await runAdminTool("github_delete_file", {}, ctx)).isError).toBe(true);
    const r = await runAdminTool("github_delete_file", { path: "src/app/old/page.tsx" }, ctx);
    expect(r).toEqual({ output: { ok: true, path: "src/app/old/page.tsx", branch: "admin/mcp-20261016-abc123" } });
    expect(gh.deleteFile).toHaveBeenCalledWith("src/app/old/page.tsx", "MCP delete", "admin/mcp-20261016-abc123");
    expect(ctx.log).toHaveBeenCalledWith("Deleted src/app/old/page.tsx on admin/mcp-20261016-abc123: MCP delete");
  });

  it("github_write_binary_file needs a path and a file, and never opens a branch for a bad upload", async () => {
    expect((await runAdminTool("github_write_binary_file", { base64Content: "AAAA" }, ctx)).output).toEqual({ error: "A repo-relative file path is required." });
    const none = await runAdminTool("github_write_binary_file", { path: "public/a.png" }, ctx);
    expect(none.isError).toBe(true);
    expect(String((none.output as { error: string }).error)).toMatch(/No file was sent/);
    expect(ctx.ensureWriteBranch).not.toHaveBeenCalled();
  });

  it("github_write_binary_file downloads a source_url over fetch and commits the bytes", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7]);
    const fetchMock = vi.fn(async () => new Response(png, { status: 200, headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await runAdminTool("github_write_binary_file", { path: "public/logo.png", source_url: " https://images.example.com/logo.png ", message: "Add logo" }, ctx);
    expect(r.output).toMatchObject({ ok: true, path: "public/logo.png", sizeBytes: 10 });
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe("https://images.example.com/logo.png");
    expect((fetchMock.mock.calls[0] as unknown[])[1]).toMatchObject({ redirect: "manual" });
    expect(gh.putFileBase64).toHaveBeenCalledWith("public/logo.png", png.toString("base64"), "Add logo", "admin/mcp-20261016-abc123");
    expect(ctx.log).toHaveBeenCalledWith("Wrote binary file public/logo.png on admin/mcp-20261016-abc123: Add logo");
  });

  it("github_write_binary_file refuses a non-https source_url without fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const r = await runAdminTool("github_write_binary_file", { path: "public/logo.png", source_url: "http://127.0.0.1/logo.png" }, ctx);
    expect(r).toEqual({ output: { error: "Only public https links can be downloaded." }, isError: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(gh.putFileBase64).not.toHaveBeenCalled();
  });
});

describe("check tools", () => {
  it("seo_check_page defaults to / and turns a failure into a tool error", async () => {
    await expect(runAdminTool("seo_check_page", {}, ctx)).resolves.toEqual({ output: { url: "/" } });
    vi.mocked(checkPageSeo).mockRejectedValueOnce(new Error("timeout"));
    expect(await runAdminTool("seo_check_page", { path: "/about" }, ctx)).toEqual({ output: { error: "timeout" }, isError: true });
    vi.mocked(checkPageSeo).mockRejectedValueOnce("weird");
    expect(await runAdminTool("seo_check_page", { path: "/about" }, ctx)).toEqual({ output: { error: "Fetch failed" }, isError: true });
  });

  it("check_code_quality passes the normalised path and content, and reports failures", async () => {
    await expect(runAdminTool("check_code_quality", { path: "./src/a.tsx", content: "let a" }, ctx)).resolves.toEqual({ output: { eslint: { errorCount: 0 }, patternIssues: [] } });
    expect(checkCode).toHaveBeenCalledWith("src/a.tsx", "let a");
    vi.mocked(checkCode).mockRejectedValueOnce(new Error("eslint crashed"));
    expect(await runAdminTool("check_code_quality", { path: "a.ts" }, ctx)).toEqual({ output: { error: "eslint crashed" }, isError: true });
    vi.mocked(checkCode).mockRejectedValueOnce(42);
    expect(await runAdminTool("check_code_quality", { path: "a.ts" }, ctx)).toEqual({ output: { error: "Code check failed" }, isError: true });
  });

  it("check_pr_status waits on the change's PR and reports GitHub errors", async () => {
    ctx = makeCtx({ getPRNumber: vi.fn(async () => 7) });
    vi.mocked(gh.getPRChecksDetail).mockResolvedValue({ status: "success", previewUrl: "https://p", failingChecks: [] });
    expect((await runAdminTool("check_pr_status", {}, ctx)).output).toEqual({ status: "success", previewUrl: "https://p", failingChecks: [] });
    expect(gh.getPRChecksDetail).toHaveBeenCalledWith(7);
    vi.mocked(gh.getPRChecksDetail).mockRejectedValue(new Error("Bad credentials"));
    expect(await runAdminTool("check_pr_status", {}, ctx)).toEqual({ output: { error: "Bad credentials" }, isError: true });
    vi.mocked(gh.getPRChecksDetail).mockRejectedValue(null);
    expect(await runAdminTool("check_pr_status", {}, ctx)).toEqual({ output: { error: "Failed to check status" }, isError: true });
  });

  it("get_check_log_excerpt reports a failed log fetch", async () => {
    vi.mocked(gh.getFailingCheckLogExcerpt).mockRejectedValueOnce(new Error("404"));
    expect(await runAdminTool("get_check_log_excerpt", { checkRunId: 5 }, ctx)).toEqual({ output: { error: "404" }, isError: true });
    expect(gh.getFailingCheckLogExcerpt).toHaveBeenCalledWith(5);
    vi.mocked(gh.getFailingCheckLogExcerpt).mockRejectedValueOnce(undefined);
    expect(await runAdminTool("get_check_log_excerpt", { checkRunId: 5 }, ctx)).toEqual({ output: { error: "Failed to fetch log" }, isError: true });
  });

  it("lighthouse accepts desktop and defaults the path", async () => {
    await runAdminTool("lighthouse_check_page", { strategy: "desktop" }, ctx);
    expect(checkLighthouse).toHaveBeenCalledWith("/", "desktop");
    vi.mocked(checkLighthouse).mockRejectedValueOnce("nope");
    expect(await runAdminTool("lighthouse_check_page", {}, ctx)).toEqual({ output: { error: "Lighthouse check failed" }, isError: true });
  });
});

describe("applyTextEdits", () => {
  it("applies edits in order, each against the result of the last", () => {
    expect(applyTextEdits("a b c", [{ old_text: "a", new_text: "x" }, { old_text: "x b", new_text: "y" }])).toEqual({ ok: true, content: "y c" });
  });

  it("keeps $ patterns in new_text literal", () => {
    expect(applyTextEdits("price", [{ old_text: "price", new_text: "$& $1" }])).toEqual({ ok: true, content: "$& $1" });
  });

  it("refuses empty, missing and ambiguous old_text, naming which edit", () => {
    expect(applyTextEdits("a", [{ old_text: "", new_text: "x" }])).toMatchObject({ ok: false, error: expect.stringMatching(/^Edit 1 of 1: old_text is empty/) });
    expect(applyTextEdits("a", [{ old_text: "a", new_text: "b" }, { old_text: "zz", new_text: "y" }])).toMatchObject({ ok: false, error: expect.stringMatching(/^Edit 2 of 2: old_text was not found/) });
    expect(applyTextEdits("a a", [{ old_text: "a", new_text: "b" }])).toMatchObject({ ok: false, error: expect.stringMatching(/appears 2 times/) });
  });
});

describe("searchRepoFiles", () => {
  const files = [
    { path: "docs/find-your-coffee.md", content: "Notes" },
    { path: "_legacy-manus-app/FindYourCoffee.tsx", content: "Find your coffee" },
    { path: "src/app/find-your-coffee/page.tsx", content: "line one\n  <h1>Find Your Coffee</h1>\nend" },
  ];

  it("matches names by slug or every word, code first, and lines with numbers", () => {
    const r = searchRepoFiles(files, "Find your coffee");
    expect(r.fileNameMatches).toEqual(["src/app/find-your-coffee/page.tsx", "docs/find-your-coffee.md", "_legacy-manus-app/FindYourCoffee.tsx"]);
    expect(r.textMatches).toEqual([
      { path: "src/app/find-your-coffee/page.tsx", lines: ["2: <h1>Find Your Coffee</h1>"] },
      { path: "_legacy-manus-app/FindYourCoffee.tsx", lines: ["1: Find your coffee"] },
    ]);
    expect(r.textMatchFileCount).toBe(2);
  });

  it("caps lines per file and the number of files", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ path: `src/f${i}.ts`, content: "hit\nhit\nhit\nhit" }));
    const r = searchRepoFiles(many, "hit");
    expect(r.textMatches).toHaveLength(20);
    expect(r.textMatches[0].lines).toHaveLength(3);
    expect(r.textMatchFileCount).toBe(25);
  });
});

describe("github_search_code", () => {
  beforeEach(() => {
    vi.mocked(gh.getRepoTextFiles).mockResolvedValue([
      { path: "src/app/page.tsx", content: "Essays" },
      { path: "src/components/essays.tsx", content: "<h2>Essays</h2>" },
      { path: ".env.local", content: "Essays" },
    ]);
  });

  it("needs a query", async () => {
    expect(await runAdminTool("github_search_code", { query: "  " }, ctx)).toEqual({ output: { error: "Say what to look for in `query`." }, isError: true });
  });

  it("searches the change's branch, skips off-limits files and honours path_prefix", async () => {
    vi.mocked(ctx.getReadBranch).mockResolvedValue("admin/mcp-x");
    const r = await runAdminTool("github_search_code", { query: "essays", path_prefix: "src/components" }, ctx);
    expect(gh.getRepoTextFiles).toHaveBeenCalledWith("admin/mcp-x");
    expect(r.output).toMatchObject({ fileNameMatches: ["src/components/essays.tsx"], textMatchFileCount: 1, next: expect.stringMatching(/github_edit_file/) });
    const all = await runAdminTool("github_search_code", { query: "essays" }, ctx);
    expect(JSON.stringify(all.output)).not.toContain(".env.local");
  });

  it("says when nothing matched", async () => {
    const r = await runAdminTool("github_search_code", { query: "nothing like this" }, ctx);
    expect((r.output as { next: string }).next).toMatch(/^Nothing matched/);
  });
});

describe("github_edit_file", () => {
  const edit = (input: Record<string, unknown>) => runAdminTool("github_edit_file", { path: "src/app/page.tsx", message: "Blue heading", ...input }, ctx);

  it("checks the path and the edits list", async () => {
    expect((await edit({ path: "" })).isError).toBe(true);
    expect((await edit({ path: ".env.local", edits: [{ old_text: "a", new_text: "b" }] })).output).toMatchObject({ error: expect.stringMatching(/off-limits/) });
    for (const edits of [undefined, [], ["x"], [{ old_text: 1, new_text: "b" }]]) {
      expect((await edit({ edits })).output).toEqual({ error: "`edits` must be a list of { old_text, new_text } pairs (at least one)." });
    }
    expect(gh.putFile).not.toHaveBeenCalled();
  });

  it("refuses a file that doesn't exist, or an edit that doesn't apply", async () => {
    vi.mocked(gh.getFile).mockResolvedValueOnce(null);
    expect((await edit({ edits: [{ old_text: "a", new_text: "b" }] })).output).toMatchObject({ error: expect.stringMatching(/does not exist. Use github_write_file/) });
    expect((await edit({ edits: [{ old_text: "missing", new_text: "b" }] })).output).toMatchObject({ error: expect.stringMatching(/not found/) });
    expect(gh.putFile).not.toHaveBeenCalled();
  });

  it("writes the edited file to the change's branch", async () => {
    const r = await edit({ edits: [{ old_text: "file body", new_text: "new body" }] });
    expect(gh.putFile).toHaveBeenCalledWith("src/app/page.tsx", "new body", "Blue heading", "admin/mcp-20261016-abc123");
    expect(r.output).toEqual({ ok: true, path: "src/app/page.tsx", branch: "admin/mcp-20261016-abc123", editsApplied: 1 });
  });

  it("does nothing when the edit changes nothing", async () => {
    const r = await edit({ message: undefined, edits: [{ old_text: "file body", new_text: "file body" }] });
    expect(r.output).toEqual({ ok: true, path: "src/app/page.tsx", branch: "admin/mcp-20261016-abc123", unchanged: true });
    expect(gh.putFile).not.toHaveBeenCalled();
  });
});

describe("spam tools", () => {
  const WALL_SRC = 'export const WALL_OF_SHAME: WallEntry[] = [];\n';

  it("create_confrontation_link signs a spamtoast.com link that verifies", async () => {
    const r = await runAdminTool("create_confrontation_link", { company: "Acme Leads", domain: "acme.io", email: "Bob@Acme.io" }, ctx);
    expect(r.isError).toBeFalsy();
    const url = new URL((r.output as { url: string }).url);
    expect(url.origin + url.pathname).toBe("https://spamtoast.com/youve-been-reported");
    expect(verifyConfrontParams(Object.fromEntries(url.searchParams))).toEqual({ company: "Acme Leads", domain: "acme.io", email: "bob@acme.io" });
    expect(ctx.log).toHaveBeenCalledWith("Made a confrontation link for Acme Leads");
    expect(ctx.ensureWriteBranch).not.toHaveBeenCalled();
  });

  it("create_confrontation_link needs a company and the signing secret", async () => {
    expect(await runAdminTool("create_confrontation_link", { company: " " }, ctx)).toEqual({ output: { error: "Say which company or sender (company)." }, isError: true });
    vi.stubEnv("CONFRONT_LINK_SECRET", "");
    const r = await runAdminTool("create_confrontation_link", { company: "Acme" }, ctx);
    expect(r.isError).toBe(true);
    expect((r.output as { error: string }).error).toMatch(/CONFRONT_LINK_SECRET/);
    vi.unstubAllEnvs();
  });

  it("list_wall_of_shame ranks the live list and says when it's empty", async () => {
    expect((await runAdminTool("list_wall_of_shame", {}, ctx)).output).toMatchObject({ count: 0, entries: [], note: expect.stringMatching(/empty/) });
    (WALL_OF_SHAME as unknown[]).push(
      { company: "Low", spamType: "cold-outreach", reports: 1, firstReported: "2026-10-01" },
      { company: "High", spamType: "phishing-scam", reports: 5, firstReported: "2026-09-01" },
    );
    const out = (await runAdminTool("list_wall_of_shame", {}, ctx)).output as { count: number; entries: { company: string; spamTypeLabel: string }[] };
    expect(out.count).toBe(2);
    expect(out.entries.map((e) => e.company)).toEqual(["High", "Low"]);
    expect(out.entries[0].spamTypeLabel).toBe("Phishing / Scam");
    (WALL_OF_SHAME as unknown[]).length = 0;
  });

  it("add_to_wall_of_shame edits the list on the change's own branch", async () => {
    vi.mocked(gh.getFile).mockResolvedValueOnce({ content: WALL_SRC, sha: "w" });
    const r = await runAdminTool("add_to_wall_of_shame", { company: "Acme", domain: "acme.io", spamType: "cold-outreach", firstReported: "2026-10-20", message: "[by Kim]" }, ctx);
    expect(r.isError).toBeFalsy();
    expect(r.output).toMatchObject({ ok: true, action: "added", branch: "admin/mcp-20261016-abc123" });
    expect(gh.getFile).toHaveBeenCalledWith("src/lib/content/wall-of-shame.ts", "admin/mcp-20261016-abc123");
    const [path, content, message, branch] = vi.mocked(gh.putFile).mock.calls[0];
    expect([path, message, branch]).toEqual(["src/lib/content/wall-of-shame.ts", "Wall of Shame: add Acme [by Kim]", "admin/mcp-20261016-abc123"]);
    expect(content).toContain('{"company":"Acme","domain":"acme.io","spamType":"cold-outreach","reports":1,"firstReported":"2026-10-20"},');
  });

  it("add_to_wall_of_shame refuses bad input or a missing file and writes nothing", async () => {
    vi.mocked(gh.getFile).mockResolvedValueOnce({ content: WALL_SRC, sha: "w" });
    const bad = await runAdminTool("add_to_wall_of_shame", { company: "Acme", spamType: "rude" }, ctx);
    expect(bad.isError).toBe(true);
    vi.mocked(gh.getFile).mockResolvedValueOnce(null);
    const missing = await runAdminTool("add_to_wall_of_shame", { company: "Acme", spamType: "cold-outreach" }, ctx);
    expect((missing.output as { error: string }).error).toMatch(/missing/);
    expect(gh.putFile).not.toHaveBeenCalled();
  });

  it("add_to_wall_of_shame needs a change (no write branch without one)", async () => {
    const noChange = makeCtx({ ensureWriteBranch: vi.fn(async () => { throw new Error("Start a change first"); }) });
    await expect(runAdminTool("add_to_wall_of_shame", { company: "Acme", spamType: "cold-outreach" }, noChange)).rejects.toThrow(/Start a change first/);
    expect(gh.putFile).not.toHaveBeenCalled();
  });
});
