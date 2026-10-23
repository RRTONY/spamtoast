import { beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import * as cs from "@/lib/admin/change-sets";
import { runAdminTool } from "@/lib/admin/tools";
import { getProjectRules } from "@/lib/admin/project-rules";
import { createAdminMcpServer } from "@/lib/admin/mcp-server";
import { PENDING_CHANGES_UI_URI } from "@/lib/admin/mcp-ui-widgets";
import { READ_ONLY_TOOLS, type McpUser } from "@/lib/admin/mcp-auth";
import { after } from "next/server";
import { buildMcpToolContext } from "@/lib/admin/mcp-tool-context";
import { listKnowledgeBase } from "@/lib/admin/project-rules";
import { isNetlifyConfigured, listDeploys } from "@/lib/admin/netlify-client";

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/admin/netlify-client", () => ({ isNetlifyConfigured: vi.fn(() => true), listDeploys: vi.fn(async () => []) }));
vi.mock("@/lib/admin/github-client", () => ({ getPRChecksDetail: vi.fn(), getPRHeadSha: vi.fn(), GITHUB_REPO: { owner: "RRTONY", repo: "spamtoast" } }));
vi.mock("@/lib/admin/mcp-tool-context", () => ({
  buildMcpToolContext: vi.fn(async () => ({ ctx: {}, auditLog: [], finalize: async () => ({ branch: null, prNumber: null, prUrl: null }) })),
}));
vi.mock("@/lib/admin/tools", async (orig) => ({ ...(await orig<typeof import("@/lib/admin/tools")>()), runAdminTool: vi.fn(async () => ({ output: { ok: true } })) }));
vi.mock("@/lib/admin/project-rules", async (orig) => ({
  ...(await orig<typeof import("@/lib/admin/project-rules")>()),
  getProjectRules: vi.fn(async () => ({ version: "rv-current", content: "# AGENTS", fullRules: "# CONTRIBUTING" })),
  getProjectGuides: vi.fn(async () => ({ taskGuide: "tg", projectStructure: "ps", projectStatus: "ms" })),
  listKnowledgeBase: vi.fn(async () => ["docs/ai/README.md"]),
}));
vi.mock("@/lib/admin/change-sets", async (orig) => ({
  ...(await orig<typeof import("@/lib/admin/change-sets")>()),
  getChangeSet: vi.fn(),
  createChangeSet: vi.fn(),
  confirmChange: vi.fn(),
  markEdited: vi.fn(async () => {}),
  publishChange: vi.fn(async () => ({ ok: true, changeId: KEY, mergeSha: "m" })),
  discardChange: vi.fn(async () => ({ ok: true, changeId: KEY })),
  undoChange: vi.fn(),
  submitForReview: vi.fn(),
  listOpenChangeSets: vi.fn(async () => []),
  reconcileWithGitHub: vi.fn(async (o: unknown) => o),
  pendingOverview: vi.fn(async () => ({ changes: [], olderChanges: [] })),
  buildReview: vi.fn(),
  changeHistory: vi.fn(async () => []),
}));

const KEY = "20261016-abc123";
const users: Record<string, McpUser> = {
  read: { name: "Reader", email: "r@x.com", role: "read" },
  edit: { name: "Kim", email: "kim@x.com", role: "edit" },
  write: { name: "Tony", email: "tony@x.com", role: "write" },
};
const change = (over: Partial<cs.ChangeSet> = {}) => ({ key: KEY, title: "Fix typo", request: "r", status: "draft", requestedBy: { name: "Kim" }, createdAt: "t", branch: null, prNumber: null, ...over }) as cs.ChangeSet;

async function connect(user: McpUser) {
  const server = createAdminMcpServer(user, "https://spamtoast.com");
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[]; structuredContent?: Record<string, unknown>; _meta?: Record<string, unknown> };
    return { ...r, json: JSON.parse(r.content[0].text) };
  };
  return { client, call };
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.mocked(cs.getChangeSet).mockResolvedValue(change());
});

describe("tools/list", () => {
  it("read users only see read-only tools", async () => {
    const { client } = await connect(users.read);
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(5);
    for (const t of tools) expect(READ_ONLY_TOOLS.has(t.name), t.name).toBe(true);
    expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true);
  });

  it("edit users don't see publish_changes; write users do", async () => {
    const edit = (await (await connect(users.edit)).client.listTools()).tools.map((t) => t.name);
    expect(edit).toContain("github_write_file");
    expect(edit).not.toContain("publish_changes");
    expect((await (await connect(users.write)).client.listTools()).tools.map((t) => t.name)).toContain("publish_changes");
  });

  it("gated tools require rules_version, edit tools require change_id, and publish is marked destructive", async () => {
    const { tools } = await (await connect(users.write)).client.listTools();
    const by = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(by.github_write_file.inputSchema.required).toEqual(expect.arrayContaining(["path", "change_id", "rules_version"]));
    expect(by.add_to_wall_of_shame.inputSchema.required).toEqual(expect.arrayContaining(["company", "spamType", "change_id", "rules_version"]));
    expect(by.github_read_file.inputSchema.required).not.toContain("rules_version");
    expect(by.github_read_file.inputSchema.properties).toHaveProperty("change_id");
    expect(by.publish_changes.annotations).toMatchObject({ destructiveHint: true, openWorldHint: true, readOnlyHint: false });
    expect(by.github_write_file.description).toMatch(/Requires rules_version/);
  });

  // 2026-10-17: request_upload_link listed change_id in "required" twice.
  // Claude ignored it; ChatGPT dropped every tool ("editing tools
  // aren't available in this session"). Same bug ramprate-ui fixed 2026-10-08.
  it.each(["read", "edit", "write"] as const)("every tool schema is well formed (%s)", async (role) => {
    const { tools } = await (await connect(users[role])).client.listTools();
    const problems: string[] = [];
    const check = (name: string, schema: Record<string, unknown>, at: string) => {
      const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
      const required = (schema.required ?? []) as string[];
      if (new Set(required).size !== required.length) problems.push(`${name}${at}: duplicate in required`);
      for (const key of required) if (!(key in props)) problems.push(`${name}${at}: required "${key}" has no property`);
      for (const [key, prop] of Object.entries(props)) {
        if (prop.type === "array" && !prop.items) problems.push(`${name}${at}.${key}: array without items`);
        if (prop.type === "object") check(name, prop, `${at}.${key}`);
        const items = prop.items as Record<string, unknown> | undefined;
        if (items?.type === "object") check(name, items, `${at}.${key}[]`);
      }
    };
    for (const t of tools) {
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(t.name)) problems.push(`${t.name}: bad name`);
      if (t.inputSchema.type !== "object") problems.push(`${t.name}: not an object schema`);
      check(t.name, t.inputSchema as Record<string, unknown>, "");
      const meta = t._meta as Record<string, unknown> | undefined;
      const template = meta?.["openai/outputTemplate"] ?? (meta?.ui as { resourceUri?: string } | undefined)?.resourceUri;
      if (template !== undefined && template !== PENDING_CHANGES_UI_URI) problems.push(`${t.name}: unknown widget ${String(template)}`);
    }
    expect(problems).toEqual([]);
  });
});

describe("resources", () => {
  it("serves the review card and refuses unknown resources", async () => {
    const { client } = await connect(users.read);
    const { contents } = await client.readResource({ uri: PENDING_CHANGES_UI_URI });
    expect(contents[0]).toMatchObject({ mimeType: "text/html;profile=mcp-app" });
    await expect(client.readResource({ uri: "ui://other" })).rejects.toThrow(/Unknown resource/);
    await expect(client.listResourceTemplates()).resolves.toMatchObject({ resourceTemplates: [] });
  });
});

describe("access and rules gating", () => {
  it("refuses a tool the role can't use, even if called directly", async () => {
    const { call } = await connect(users.read);
    const r = await call("github_write_file", { path: "a.ts", content: "x", change_id: KEY, rules_version: "rv-current" });
    expect(r.isError).toBe(true);
    expect(r.json.error).toMatch(/access level \(read\) doesn't allow github_write_file/);
    expect(runAdminTool).not.toHaveBeenCalled();
    const e = await (await connect(users.edit)).call("publish_changes", { change_id: KEY, rules_version: "rv-current", review_token: "t" });
    expect(e.isError).toBe(true);
    expect(cs.publishChange).not.toHaveBeenCalled();
  });

  it("get_project_rules returns the rules version and both rule files", async () => {
    const r = await (await connect(users.edit)).call("get_project_rules");
    expect(r.json).toMatchObject({ rulesVersion: "rv-current", rules: "# AGENTS", fullRules: "# CONTRIBUTING", you: { role: "edit" } });
  });

  it("blocks gated tools without, or with a stale, rules_version", async () => {
    const { call } = await connect(users.write);
    expect((await call("github_write_file", { path: "a.ts", content: "x", change_id: KEY })).json.error).toMatch(/call get_project_rules first/);
    expect((await call("github_write_file", { path: "a.ts", content: "x", change_id: KEY, rules_version: "old" })).json.error).toMatch(/rules changed since you read them/);
    expect((await call("publish_changes", { change_id: KEY, review_token: "t" })).isError).toBe(true);
    expect(runAdminTool).not.toHaveBeenCalled();
    expect(cs.publishChange).not.toHaveBeenCalled();
  });

  it("fails closed when the rules can't be loaded", async () => {
    vi.mocked(getProjectRules).mockRejectedValue(new Error("GitHub down"));
    const r = await (await connect(users.write)).call("github_write_file", { path: "a.ts", content: "x", change_id: KEY, rules_version: "rv-current" });
    expect(r.json.error).toMatch(/Could not load AGENTS.md.*was not made/);
    expect(runAdminTool).not.toHaveBeenCalled();
  });
});

describe("change rules", () => {
  const gated = { rules_version: "rv-current" };

  it("an edit needs a valid change_id", async () => {
    const { call } = await connect(users.edit);
    expect((await call("github_write_file", { path: "a.ts", content: "x", ...gated })).json.error).toMatch(/Every edit must belong to a change/);
    expect((await call("github_write_file", { path: "a.ts", content: "x", change_id: "../../main", ...gated })).json.error).toMatch(/isn't a valid change_id/);
    vi.mocked(cs.getChangeSet).mockResolvedValue(null);
    expect((await call("github_write_file", { path: "a.ts", content: "x", change_id: KEY, ...gated })).json.error).toMatch(/No change found/);
    expect(runAdminTool).not.toHaveBeenCalled();
  });

  it("refuses edits before the person confirmed, or after the change closed", async () => {
    const { call } = await connect(users.edit);
    vi.mocked(cs.getChangeSet).mockResolvedValue(change({ status: "awaiting_confirmation", understoodAs: "Change a word" }));
    expect((await call("github_write_file", { path: "a.ts", content: "x", change_id: KEY, ...gated })).json.error).toMatch(/hasn't confirmed what you understood yet \("Change a word"\)/);
    vi.mocked(cs.getChangeSet).mockResolvedValue(change({ status: "published" }));
    expect((await call("github_write_file", { path: "a.ts", content: "x", change_id: KEY, ...gated })).json.error).toMatch(/already published/);
    expect(runAdminTool).not.toHaveBeenCalled();
    expect(cs.markEdited).not.toHaveBeenCalled();
  });

  it("runs an allowed edit, marks the change edited and signs the commit message", async () => {
    const { call } = await connect(users.edit);
    const r = await call("github_write_file", { path: "src/app/about/page.tsx", content: "x", message: "Fix typo", change_id: `admin/mcp-${KEY}`, ...gated });
    expect(r.isError).toBeFalsy();
    expect(cs.markEdited).toHaveBeenCalled();
    expect(runAdminTool).toHaveBeenCalledWith("github_write_file", { path: "src/app/about/page.tsx", content: "x", message: "Fix typo [by Kim]" }, {});
  });

  it("publish passes the review token and the person", async () => {
    await (await connect(users.write)).call("publish_changes", { change_id: KEY, review_token: "tok", ...gated });
    expect(cs.publishChange).toHaveBeenCalledWith(KEY, "tok", users.write);
  });

  it("publish and discard need a change_id", async () => {
    const r = await (await connect(users.write)).call("discard_change", gated);
    expect(r.json.error).toMatch(/Say which change/);
    expect(cs.discardChange).not.toHaveBeenCalled();
  });

  it("start_change needs title, request and understood_as", async () => {
    const r = await (await connect(users.edit)).call("start_change", { title: "x", request: "y", ...gated });
    expect(r.json.error).toMatch(/understood_as/);
    expect(cs.createChangeSet).not.toHaveBeenCalled();
  });

  it("start_change with needs_confirmation tells the AI to stop and ask", async () => {
    vi.mocked(cs.createChangeSet).mockResolvedValue(change({ status: "awaiting_confirmation" }));
    const r = await (await connect(users.edit)).call("start_change", { title: "Fix typo", request: "fix it", understood_as: "Change teh to the on /about", needs_confirmation: true, ...gated });
    expect(r.json).toMatchObject({ view: "confirm", changeId: KEY, state: "awaiting_ok", youCanPublish: false, youCanDiscard: true });
    expect(r.json.next).toMatch(/^STOP: show the person exactly this/);
    expect(r._meta).toMatchObject({ rulesVersion: "rv-current" });
    // Only this task (owner, 2026-10-17): no list of other changes, just how to ask for it.
    expect(r.json.otherPending).toBeUndefined();
    expect(r.json.otherPendingNote).toMatch(/^Talk only about this change/);
  });

  it("request_upload_link refuses denied paths and unconfirmed changes, and signs a link otherwise", async () => {
    vi.stubEnv("MCP_OAUTH_SECRET", "s");
    const { call } = await connect(users.edit);
    expect((await call("request_upload_link", { path: "package.json", change_id: KEY, ...gated })).json.error).toMatch(/can't be changed from here/);
    vi.mocked(cs.getChangeSet).mockResolvedValue(change({ status: "awaiting_confirmation" }));
    expect((await call("request_upload_link", { path: "public/a.png", change_id: KEY, ...gated })).json.error).toMatch(/hasn't confirmed/);
    vi.mocked(cs.getChangeSet).mockResolvedValue(change());
    const ok = await call("request_upload_link", { path: "public/a.png", change_id: KEY, ...gated });
    expect(ok.json.uploadUrl).toMatch(/^https:\/\/spamtoast\.com\/api\/mcp\/upload\?t=tgmcp_up\./);
    vi.unstubAllEnvs();
  });

  it("unknown tools are refused", async () => {
    const r = await (await connect(users.write)).call("rm_rf", {});
    expect(r.isError).toBe(true);
  });
});

const PREVIEW = "https://deploy-preview-4--spamtoast.netlify.app";
const gated = { rules_version: "rv-current" };
const review = (over: Record<string, unknown> = {}) =>
  ({ changeId: KEY, title: "Fix typo", checks: [{ key: "build", state: "passed" }], headSha: "h1", previewUrl: PREVIEW, ...over }) as unknown as Awaited<ReturnType<typeof cs.buildReview>>;

describe("get_project_rules notes per role", () => {
  it("tells read and write users what they can do, and survives a missing knowledge base", async () => {
    vi.mocked(listKnowledgeBase).mockRejectedValue(new Error("404"));
    const read = await (await connect(users.read)).call("get_project_rules");
    expect(read.json.you.note).toMatch(/Look-only access/);
    expect(read.json.knowledgeBase).toEqual([]);
    expect(read.json).toMatchObject({ taskGuide: "tg", projectStructure: "ps", projectStatus: "ms" });
    expect(read.json.howToUse).toContain('Pass "rv-current" as rules_version');
    const write = await (await connect(users.write)).call("get_project_rules");
    expect(write.json.you.note).toBe("Full access, including publishing.");
  });
});

describe("list_pending_changes", () => {
  it("lists everything after tidying up with GitHub when nothing is open", async () => {
    const r = await (await connect(users.edit)).call("list_pending_changes");
    expect(cs.reconcileWithGitHub).toHaveBeenCalledWith([]);
    expect(cs.buildReview).not.toHaveBeenCalled();
    expect(r.json).toMatchObject({ view: "list", changes: [], youCanPublish: false, youCanDiscard: true, you: { name: "Kim", role: "edit" }, otherPending: [] });
    expect(r._meta).toEqual({ rulesVersion: "rv-current" });
  });

  it("says when the asked-for change doesn't exist", async () => {
    vi.mocked(cs.getChangeSet).mockResolvedValue(null);
    const r = await (await connect(users.write)).call("list_pending_changes", { change_id: KEY });
    expect(r.isError).toBeFalsy();
    expect(r.json).toMatchObject({ view: "list", error: `No change found with id ${KEY}.`, youCanPublish: true });
  });

  it("asked about one change, answers about that change only, still counting the others for what goes live", async () => {
    const mine = change({ files: [{ _key: "f", path: "src/app/about/page.tsx", status: "modified" }] });
    const other = change({ key: "20261016-zzz999", title: "Other" });
    vi.mocked(cs.listOpenChangeSets).mockResolvedValue([mine, other]);
    vi.mocked(cs.pendingOverview).mockResolvedValue({
      changes: [{ changeId: KEY, title: "Fix typo" }, { changeId: "20261016-zzz999", title: "Other" }],
      olderChanges: [{ changeId: null, prNumber: 9, prUrl: "u9" }],
    } as never);
    vi.mocked(cs.getChangeSet).mockResolvedValue(mine);
    vi.mocked(cs.buildReview).mockResolvedValue(review());
    const r = await (await connect(users.write)).call("list_pending_changes", { change_id: KEY });
    expect(cs.buildReview).toHaveBeenCalledWith(mine, 2);
    expect(r.json).toMatchObject({ view: "detail", changeId: KEY });
    for (const key of ["otherWaiting", "olderChanges", "otherPending"]) expect(r.json, key).not.toHaveProperty(key);
    expect(r.json.otherPendingNote).toMatch(/call list_pending_changes without a change_id/);
    // No screenshots any more (removed 2026-10-17): nothing runs after the reply.
    expect(after).not.toHaveBeenCalled();
  });

  it("asked what's waiting (no change_id), opens the only change and lists everything else", async () => {
    const mine = change();
    vi.mocked(cs.listOpenChangeSets).mockResolvedValue([mine, change({ key: "20261016-zzz999", title: "Other", status: "draft" })]);
    vi.mocked(cs.pendingOverview).mockResolvedValue({ changes: [{ changeId: KEY, title: "Fix typo" }], olderChanges: [] } as never);
    vi.mocked(cs.reconcileWithGitHub).mockResolvedValueOnce([mine]);
    vi.mocked(cs.buildReview).mockResolvedValue(review());
    const r = await (await connect(users.write)).call("list_pending_changes");
    expect(r.json).toMatchObject({ view: "detail", changeId: KEY, otherWaiting: [], olderChanges: [] });
    expect(r.json).not.toHaveProperty("unrelatedDrafts");
    expect(r.json.otherPending.map((o: { changeId: string }) => o.changeId)).toEqual(["20261016-zzz999"]);
    expect(r.json.otherPendingNote).toMatch(/^The person asked what's waiting/);
  });

  it("picks the only open change without a change_id", async () => {
    const only = change();
    vi.mocked(cs.listOpenChangeSets).mockResolvedValue([only]);
    vi.mocked(cs.buildReview).mockResolvedValue(review());
    const { call } = await connect(users.write);
    expect((await call("list_pending_changes")).json.view).toBe("detail");
    expect(cs.buildReview).toHaveBeenCalledWith(only, 0);
  });

  it("Other Pending Changes says so when the list can't load, without failing the answer", async () => {
    vi.mocked(cs.listOpenChangeSets).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("GitHub down"));
    const r = await (await connect(users.edit)).call("list_pending_changes");
    expect(r.isError).toBeFalsy();
    expect(r.json.otherPending).toBeNull();
    expect(r.json.otherPendingNote).toMatch(/Couldn't load the other pending changes/);
  });
});

describe("phone and laptop screenshots are gone (2026-10-17)", () => {
  it("preview_on_devices isn't offered to anyone", async () => {
    const { tools } = await (await connect(users.write)).client.listTools();
    expect(tools.map((t) => t.name)).not.toContain("preview_on_devices");
  });
});

describe("history, confirm, discard and undo", () => {
  it("list_change_history passes the limit (defaulting bad ones to 20) and says who can restore", async () => {
    vi.mocked(cs.changeHistory).mockResolvedValue([{ changeId: KEY }] as never);
    const { call } = await connect(users.read);
    const r = await call("list_change_history", { limit: 5 });
    expect(cs.changeHistory).toHaveBeenLastCalledWith(5);
    expect(r.json).toMatchObject({ view: "history", history: [{ changeId: KEY }], youCanRestore: false });
    await call("list_change_history", { limit: "lots" });
    expect(cs.changeHistory).toHaveBeenLastCalledWith(20);
    expect((await (await connect(users.edit)).call("list_change_history")).json.youCanRestore).toBe(true);
  });

  it("confirm_change records the yes and says what's next, or passes on the refusal", async () => {
    vi.mocked(cs.confirmChange).mockResolvedValueOnce({ ok: true, changeId: KEY, appliesTo: "mobile" });
    const { call } = await connect(users.edit);
    const ok = await call("confirm_change", { change_id: KEY, applies_to: "mobile", ...gated });
    expect(cs.confirmChange).toHaveBeenCalledWith(KEY, "mobile");
    expect(ok.isError).toBeFalsy();
    expect(ok.json).toMatchObject({ ok: true, appliesToLabel: expect.any(String), next: expect.stringContaining(`change_id "${KEY}"`) });
    vi.mocked(cs.confirmChange).mockResolvedValueOnce({ ok: false, error: "This change is already published." });
    const no = await call("confirm_change", { change_id: KEY, ...gated });
    expect(no.isError).toBe(true);
    expect(no.json).toEqual({ ok: false, error: "This change is already published." });
  });

  it("confirm_change without a change_id is refused", async () => {
    const r = await (await connect(users.edit)).call("confirm_change", gated);
    expect(r.json.error).toMatch(/Every edit must belong to a change/);
    expect(cs.confirmChange).not.toHaveBeenCalled();
  });

  it("discard_change discards that change and doesn't list the others", async () => {
    vi.mocked(cs.listOpenChangeSets).mockResolvedValue([change(), change({ key: "20261016-zzz999", title: "Other" })]);
    const r = await (await connect(users.edit)).call("discard_change", { change_id: KEY, ...gated });
    expect(cs.discardChange).toHaveBeenCalledWith(KEY, users.edit);
    expect(r.json.otherPending).toBeUndefined();
    expect(r.json.otherPendingNote).toMatch(/^Talk only about this change/);
  });

  it("undo_change needs a change_id, then reports the restore change or the refusal", async () => {
    const { call } = await connect(users.edit);
    expect((await call("undo_change", gated)).json.error).toMatch(/Say which change/);
    vi.mocked(cs.undoChange).mockResolvedValueOnce({ ok: true, changeId: "20261017-und111", title: "Undo: Fix typo" });
    const ok = await call("undo_change", { change_id: KEY, ...gated });
    expect(cs.undoChange).toHaveBeenCalledWith(KEY, users.edit);
    expect(ok.json.next).toBe('Created "Undo: Fix typo". Show it with list_pending_changes and change_id "20261017-und111"; it goes live only if the person publishes it.');
    vi.mocked(cs.undoChange).mockResolvedValueOnce({ ok: false, error: "Only a published change can be undone." });
    const no = await call("undo_change", { change_id: KEY, ...gated });
    expect(no.isError).toBe(true);
    expect(no.json.error).toBe("Only a published change can be undone.");
  });

  it("publish_changes refuses when the review token is missing (passes an empty token on)", async () => {
    vi.mocked(cs.publishChange).mockResolvedValueOnce({ ok: false, error: "This change was updated after it was reviewed." });
    const r = await (await connect(users.write)).call("publish_changes", { change_id: KEY, ...gated });
    expect(cs.publishChange).toHaveBeenCalledWith(KEY, "", users.write);
    expect(r.isError).toBe(true);
  });
});

describe("start_change and submit_for_review", () => {
  it("a clear request starts working straight away", async () => {
    vi.mocked(cs.createChangeSet).mockResolvedValue(change());
    const r = await (await connect(users.write)).call("start_change", { title: " Fix typo ", request: "fix it", understood_as: "Change teh to the", applies_to: "desktop", conversation_url: "https://evil.example.com/x", ...gated });
    expect(cs.createChangeSet).toHaveBeenCalledWith({ title: "Fix typo", request: "fix it", user: users.write, understoodAs: "Change teh to the", appliesTo: "desktop", needsConfirmation: false, conversationUrl: null });
    expect(r.json).toMatchObject({ state: "working", stateLabel: "Working", youCanPublish: true, appliesTo: "desktop" });
    expect(r.json.next).toBe(`Pass change_id "${KEY}" on every edit for this request. When done, call submit_for_review, then list_pending_changes with this change_id.`);
  });

  it("submit_for_review needs a summary, cleans up before/after and says what's next", async () => {
    const { call } = await connect(users.edit);
    expect((await call("submit_for_review", { change_id: KEY, summary: "  ", ...gated })).json.error).toBe("A plain-English summary is required.");
    vi.mocked(cs.submitForReview).mockResolvedValueOnce({ ok: true, status: "ready_for_review", lint: null });
    vi.mocked(cs.listOpenChangeSets).mockResolvedValue([change(), change({ key: "20261016-zzz999" })]);
    const r = await call("submit_for_review", { change_id: KEY, summary: "Fixed the typo.", before_after: [{ label: "Title", before: "Teh", after: 3 }, null, "x", {}], ...gated });
    expect(cs.submitForReview).toHaveBeenCalledWith(change(), "Fixed the typo.", [
      { label: "Title", before: "Teh", after: "3" },
      { label: "", before: "", after: "" },
    ]);
    expect(r.json.next).toBe(`Now call list_pending_changes with change_id "${KEY}" to show the person the review.`);
    expect(r.json.otherPending).toBeUndefined();
  });

  it("submit_for_review passes on a refusal and ignores a non-array before_after", async () => {
    vi.mocked(cs.submitForReview).mockResolvedValueOnce({ ok: false, error: "Nothing has been changed in this change yet, so there's nothing to review." });
    const r = await (await connect(users.edit)).call("submit_for_review", { change_id: KEY, summary: "s", before_after: "none", ...gated });
    expect(vi.mocked(cs.submitForReview).mock.calls[0][2]).toEqual([]);
    expect(r.isError).toBe(true);
    expect(r.json.otherPending).toBeUndefined();
  });
});

describe("edits through a change", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]).toString("base64");

  it("a binary upload is checked before the change is touched", async () => {
    const { call } = await connect(users.edit);
    const bad = await call("github_write_binary_file", { path: "public/a.png", base64Content: Buffer.from("<html>").toString("base64"), change_id: KEY, ...gated });
    expect(bad.isError).toBe(true);
    const none = await call("github_write_binary_file", { path: "public/a.png", change_id: KEY, ...gated });
    expect(none.json.error).toMatch(/No file was sent/);
    expect(cs.markEdited).not.toHaveBeenCalled();
    expect(runAdminTool).not.toHaveBeenCalled();
  });

  it("a good binary upload reaches the tool as base64 only, with the commit signed", async () => {
    const r = await (await connect(users.edit)).call("github_write_binary_file", { path: "public/a.png", base64Content: png, message: "Logo", file: "ignored", change_id: KEY, ...gated });
    expect(r.isError).toBeFalsy();
    expect(cs.markEdited).toHaveBeenCalledTimes(1);
    expect(runAdminTool).toHaveBeenCalledWith("github_write_binary_file", { path: "public/a.png", base64Content: png, message: "Logo [by Kim]" }, {});
  });

  it("refuses an edit to a discarded change", async () => {
    vi.mocked(cs.getChangeSet).mockResolvedValue(change({ status: "discarded" }));
    const r = await (await connect(users.edit)).call("add_to_wall_of_shame", { company: "Acme", spamType: "cold-outreach", change_id: KEY, ...gated });
    expect(r.json.error).toBe(`Change ${KEY} is already discarded. Call start_change for a new request.`);
    expect(runAdminTool).not.toHaveBeenCalled();
  });

  it("an awaiting change without understood_as names its title", async () => {
    vi.mocked(cs.getChangeSet).mockResolvedValue(change({ status: "awaiting_confirmation", understoodAs: null }));
    const r = await (await connect(users.edit)).call("github_delete_file", { path: "a.ts", change_id: KEY, ...gated });
    expect(r.json.error).toMatch(/hasn't confirmed what you understood yet \("Fix typo"\)/);
  });

  it("adds the branch and audit log only when the call did something", async () => {
    vi.mocked(buildMcpToolContext).mockResolvedValueOnce({ ctx: {}, auditLog: ["Wrote a.ts"], finalize: async () => ({ branch: `admin/mcp-${KEY}`, prNumber: 4, prUrl: "u4" }) } as never);
    vi.mocked(runAdminTool).mockResolvedValueOnce({ output: { ok: true, path: "a.ts" } });
    const r = await (await connect(users.edit)).call("github_write_file", { path: "a.ts", content: "x", change_id: KEY, ...gated });
    expect(buildMcpToolContext).toHaveBeenCalledWith(change());
    expect(r.json).toEqual({ ok: true, path: "a.ts", branch: `admin/mcp-${KEY}`, prNumber: 4, prUrl: "u4", mcpAuditLog: ["Wrote a.ts"] });
  });

  it("read tools run without a change, and a list result is never merged with the audit log", async () => {
    vi.mocked(buildMcpToolContext).mockResolvedValueOnce({ ctx: {}, auditLog: ["x"], finalize: async () => ({ branch: "b", prNumber: 1, prUrl: "u" }) } as never);
    vi.mocked(runAdminTool).mockResolvedValueOnce({ output: [{ name: "app" }] });
    const r = await (await connect(users.read)).call("github_list_dir", { path: "src" });
    expect(buildMcpToolContext).toHaveBeenCalledWith(null);
    expect(r.json).toEqual([{ name: "app" }]);
    expect(r.structuredContent).toBeUndefined();
  });

  it("passes a tool's own error through", async () => {
    vi.mocked(runAdminTool).mockResolvedValueOnce({ output: { error: "nope.ts does not exist" }, isError: true });
    const r = await (await connect(users.read)).call("github_read_file", { path: "nope.ts", change_id: KEY });
    expect(r.isError).toBe(true);
    expect(r.json).toEqual({ error: "nope.ts does not exist" });
    expect(cs.markEdited).not.toHaveBeenCalled();
  });

  it("request_upload_link needs a path and an open change", async () => {
    const { call } = await connect(users.edit);
    expect((await call("request_upload_link", { change_id: KEY, ...gated })).json.error).toBe("Say where to save the file (path).");
    vi.mocked(cs.getChangeSet).mockResolvedValue(change({ status: "published" }));
    expect((await call("request_upload_link", { path: "public/a.png", change_id: KEY, ...gated })).json.error).toBe(`Change ${KEY} is already published. Call start_change for a new request.`);
  });
});

describe("resource list and rules hint", () => {
  it("lists the review card as the one resource", async () => {
    const { resources } = await (await connect(users.read)).client.listResources();
    expect(resources).toEqual([{ uri: PENDING_CHANGES_UI_URI, name: "Pending changes", mimeType: "text/html;profile=mcp-app" }]);
  });

  it("a read tool still answers when the rules can't be loaded, with no rules version for the card", async () => {
    vi.mocked(getProjectRules).mockRejectedValue(new Error("GitHub down"));
    const r = await (await connect(users.read)).call("list_pending_changes");
    expect(r.isError).toBeFalsy();
    expect(r._meta).toEqual({ rulesVersion: null });
  });
});

describe("check_deploy", () => {
  const deploy = { state: "ready", plain: "Built and online.", context: "production", branch: "main", startedAt: "2026-10-16T10:00:00Z", publishedAt: "2026-10-16T10:03:00Z", seconds: 180, error: null, url: "https://spamtoast.com", logUrl: "https://app.netlify.com/sites/spamtoast/deploys/d1", commit: "b7b6c87" };

  it("is a read-only tool every role can use, with an optional change_id", async () => {
    const { tools } = await (await connect(users.read)).client.listTools();
    const t = tools.find((x) => x.name === "check_deploy")!;
    expect(t.annotations?.readOnlyHint).toBe(true);
    expect(t.inputSchema.required ?? []).toEqual([]);
    expect(t.inputSchema.properties).toHaveProperty("change_id");
    expect(t.inputSchema.required ?? []).not.toContain("rules_version");
  });

  it("without a change_id shows the live site's latest 3 production builds", async () => {
    vi.mocked(listDeploys).mockResolvedValue([deploy]);
    const r = await (await connect(users.read)).call("check_deploy");
    expect(r.isError).toBeFalsy();
    expect(listDeploys).toHaveBeenCalledWith({ production: true, limit: 3 });
    expect(r.json).toEqual({ site: "Live site", deploys: [deploy] });
  });

  it("with a change_id shows that change's preview builds by its branch", async () => {
    vi.mocked(cs.getChangeSet).mockResolvedValue(change({ branch: "admin/mcp-20261016-abc123" }));
    vi.mocked(listDeploys).mockResolvedValue([{ ...deploy, state: "building", plain: "Building now.", context: "deploy-preview" }]);
    const r = await (await connect(users.edit)).call("check_deploy", { change_id: KEY });
    expect(listDeploys).toHaveBeenCalledWith({ branch: "admin/mcp-20261016-abc123", limit: 3 });
    expect(r.json.site).toBe(`Preview of change ${KEY}`);
    expect(r.json.deploys[0].plain).toBe("Building now.");
  });

  it("explains when a change has no edits yet, or doesn't exist, without calling Netlify", async () => {
    vi.mocked(cs.getChangeSet).mockResolvedValue(change({ branch: null }));
    const noCode = await (await connect(users.edit)).call("check_deploy", { change_id: KEY });
    expect(noCode.json).toEqual({ deploys: [], note: expect.stringMatching(/no edits yet/) });
    vi.mocked(cs.getChangeSet).mockResolvedValue(null);
    const missing = await (await connect(users.edit)).call("check_deploy", { change_id: KEY });
    expect(missing.json.note).toBe(`No change found with id ${KEY}.`);
    expect(listDeploys).not.toHaveBeenCalled();
  });

  it("says plainly when Netlify isn't set up or the request fails", async () => {
    vi.mocked(isNetlifyConfigured).mockReturnValue(false);
    const off = await (await connect(users.read)).call("check_deploy");
    expect(off.isError).toBe(true);
    expect(off.json.error).toMatch(/NETLIFY_AUTH_TOKEN/);
    vi.mocked(isNetlifyConfigured).mockReturnValue(true);
    vi.mocked(listDeploys).mockRejectedValue(new Error("Netlify deploys request failed (401)"));
    const failed = await (await connect(users.read)).call("check_deploy");
    expect(failed.isError).toBe(true);
    expect(failed.json.error).toBe("Netlify deploys request failed (401)");
    vi.mocked(listDeploys).mockRejectedValue("boom");
    expect((await (await connect(users.read)).call("check_deploy")).json.error).toBe("Netlify check failed");
  });
});

describe("spam tools", () => {
  const gated = { rules_version: "rv-current" };

  it("everyone sees the link and list tools; adding to the Wall of Shame needs edit", async () => {
    const read = (await (await connect(users.read)).client.listTools()).tools.map((t) => t.name);
    expect(read).toEqual(expect.arrayContaining(["create_confrontation_link", "list_wall_of_shame"]));
    expect(read).not.toContain("add_to_wall_of_shame");
    const edit = (await (await connect(users.edit)).client.listTools()).tools.map((t) => t.name);
    expect(edit).toContain("add_to_wall_of_shame");
  });

  it("link and list tools are read-only and need no rules_version or change", async () => {
    const { tools } = await (await connect(users.read)).client.listTools();
    const by = Object.fromEntries(tools.map((t) => [t.name, t]));
    for (const t of ["create_confrontation_link", "list_wall_of_shame"]) {
      expect(by[t].annotations, t).toMatchObject({ readOnlyHint: true, openWorldHint: false });
      expect(by[t].inputSchema.required ?? [], t).not.toContain("rules_version");
      expect(by[t].inputSchema.properties ?? {}, t).not.toHaveProperty("change_id");
    }
    const r = await (await connect(users.read)).call("create_confrontation_link", { company: "Acme" });
    expect(r.isError).toBeFalsy();
    expect(runAdminTool).toHaveBeenCalledWith("create_confrontation_link", { company: "Acme" }, expect.anything());
    expect(cs.markEdited).not.toHaveBeenCalled();
  });

  it("add_to_wall_of_shame needs the rules version and a change, then edits through it", async () => {
    const { call } = await connect(users.edit);
    expect((await call("add_to_wall_of_shame", { company: "Acme", spamType: "cold-outreach", change_id: KEY })).json.error).toMatch(/call get_project_rules first/);
    expect((await call("add_to_wall_of_shame", { company: "Acme", spamType: "cold-outreach", ...gated })).json.error).toMatch(/must belong to a change/);
    expect(runAdminTool).not.toHaveBeenCalled();
    const r = await call("add_to_wall_of_shame", { company: "Acme", spamType: "cold-outreach", message: "first", change_id: KEY, ...gated });
    expect(r.isError).toBeFalsy();
    expect(cs.markEdited).toHaveBeenCalledTimes(1);
    expect(runAdminTool).toHaveBeenCalledWith("add_to_wall_of_shame", { company: "Acme", spamType: "cold-outreach", message: "first [by Kim]" }, {});
  });
});
