import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { PENDING_CHANGES_HTML, PENDING_CHANGES_UI_URI } from "@/lib/admin/mcp-ui-widgets";

// Runs the card's own script in jsdom with a fake MCP Apps runtime in place
// of the esm.sh import, so the real rendering and button logic is tested.
type ToolResult = { structuredContent?: unknown; _meta?: Record<string, unknown>; isError?: boolean; content?: unknown[] };
class FakeApp {
  static last: FakeApp;
  ontoolresult: ((r: ToolResult) => void) | null = null;
  onhostcontextchanged: unknown = null;
  callServerTool = vi.fn<(req: { name: string; arguments: Record<string, unknown> }) => Promise<ToolResult>>(async () => ({ structuredContent: { ok: true } }));
  sendMessage = vi.fn(async () => {});
  openLink = vi.fn(async () => {});
  constructor() {
    FakeApp.last = this;
  }
  connect = async () => {};
  getHostContext = () => null;
}

// The card loads its runtime with `await import(RUNTIME)`; tests hand it a
// fake runtime (or a failing loader) through __load instead.
const cardScript = () =>
  PENDING_CHANGES_HTML.match(/<script type="module">([\s\S]*?)<\/script>/)![1].replace("await import(RUNTIME)", "await __load(RUNTIME)");

async function mount() {
  document.body.innerHTML = '<div id="root"></div>';
  const run = new Function("__load", `return (async () => {${cardScript()}})();`);
  await run(async () => ({ App: FakeApp, applyDocumentTheme: vi.fn(), applyHostStyleVariables: vi.fn(), applyHostFonts: vi.fn() }));
  return FakeApp.last;
}
const root = () => document.getElementById("root")!;
const btn = (id: string) => document.getElementById(id) as HTMLButtonElement;

function detail(over: Record<string, unknown> = {}) {
  return {
    view: "detail",
    changeId: "20261016-abc123",
    title: "Fix typo",
    state: "ready",
    stateLabel: "Ready for review",
    nextStep: "Open the Preview and look it over, then Publish or Discard.",
    status: "ready_for_review",
    actions: { preview: true, discard: true, publish: true, retry: false },
    canPublish: true,
    youCanPublish: true,
    youCanDiscard: true,
    reviewToken: "rt-123",
    previewUrl: "https://deploy-preview-3--spamtoast.netlify.app",
    goesLive: ["Fix typo", "No other changes are included"],
    checks: [{ key: "build", label: "Build", state: "passed", detail: "The preview site built.", required: true }],
    requestedBy: "Kim",
    createdAt: "2026-10-16T10:00:00Z",
    otherPending: [],
    ...over,
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("widget resource", () => {
  it("has a versioned ui:// URI and loads the runtime from esm.sh with every dependency pinned", () => {
    expect(PENDING_CHANGES_UI_URI).toMatch(/^ui:\/\/spamtoast-admin\/pending-changes-v\d+\.html$/);
    // 2026-10-17: unpinned, esm.sh resolved zod 4.x (broken build, no z.custom) and the card crashed.
    expect(PENDING_CHANGES_HTML).toMatch(/"https:\/\/esm\.sh\/@modelcontextprotocol\/ext-apps@\d+\.\d+\.\d+\?deps=@modelcontextprotocol\/sdk@\d+\.\d+\.\d+,zod@3\.\d+\.\d+"/);
    expect(PENDING_CHANGES_HTML).not.toMatch(/manuscdn|manus-storage|\/api\/img\//);
  });
});

describe("runtime that fails to load", () => {
  it("shows a plain message instead of a blank card", async () => {
    document.body.innerHTML = '<div id="root"></div>';
    const run = new Function("__load", `return (async () => {${cardScript()}})();`);
    await expect(run(async () => { throw new Error("t.custom is not a function"); })).rejects.toThrow("t.custom");
    expect(root().textContent).toMatch(/could not load just now. Everything it would show is in the chat reply/);
  });
});

describe("detail view", () => {
  it("shows one status, next step, what goes live and the checks", async () => {
    const app = await mount();
    app.ontoolresult!({ structuredContent: detail(), _meta: { rulesVersion: "rv1" } });
    expect(root().querySelector("h2")!.textContent).toBe("Fix typo");
    expect(root().textContent).toContain("Ready for review");
    expect(root().textContent).toContain("Next step: Open the Preview");
    expect([...root().querySelectorAll('[aria-label="What will go live"] li')].map((li) => li.textContent)).toEqual(["Fix typo", "No other changes are included"]);
    expect(root().querySelector('[aria-label="Checks"]')!.textContent).toContain("Passed");
    expect(btn("publish").disabled).toBe(false);
  });

  it("escapes every server value (no HTML injection)", async () => {
    const app = await mount();
    app.ontoolresult!({ structuredContent: detail({ title: '<img src=x onerror="alert(1)">', goesLive: ["<script>bad()</script>"] }), _meta: { rulesVersion: "rv1" } });
    expect(root().querySelector("img")).toBeNull();
    expect(root().querySelector("script")).toBeNull();
    expect(root().querySelector("h2")!.textContent).toBe('<img src=x onerror="alert(1)">');
  });

  it("greys out Publish unless the server allows it, the person may publish and the rules version is known", async () => {
    const app = await mount();
    for (const over of [{ actions: { preview: true, discard: true, publish: false, retry: false } }, { canPublish: false }, { youCanPublish: false }]) {
      app.ontoolresult!({ structuredContent: detail(over), _meta: { rulesVersion: "rv1" } });
      expect(btn("publish").disabled).toBe(true);
    }
    app.ontoolresult!({ structuredContent: detail() });
    expect(btn("publish").disabled).toBe(true);
    expect(btn("discard").disabled).toBe(true);
    expect(root().textContent).toContain("Ask in the chat to publish or discard");
  });

  it("asks before publishing, then sends the change id, rules version and review token", async () => {
    const app = await mount();
    app.ontoolresult!({ structuredContent: detail(), _meta: { rulesVersion: "rv1" } });
    btn("publish").click();
    expect(root().textContent).toContain('You are about to publish "Fix typo" to the live spamtoast.com website.');
    expect(app.callServerTool).not.toHaveBeenCalled();
    btn("yes").click();
    await waitFor(() => expect(root().textContent).toContain("Published"));
    expect(app.callServerTool).toHaveBeenCalledWith({ name: "publish_changes", arguments: { change_id: "20261016-abc123", rules_version: "rv1", review_token: "rt-123" } });
  });

  it("Cancel backs out without calling the server", async () => {
    const app = await mount();
    app.ontoolresult!({ structuredContent: detail(), _meta: { rulesVersion: "rv1" } });
    btn("publish").click();
    btn("cancel").click();
    expect(btn("publish")).not.toBeNull();
    expect(app.callServerTool).not.toHaveBeenCalled();
  });

  it("shows the server's refusal when publishing fails", async () => {
    const app = await mount();
    app.callServerTool.mockResolvedValue({ structuredContent: { ok: false, error: "The change was edited after review." } });
    app.ontoolresult!({ structuredContent: detail(), _meta: { rulesVersion: "rv1" } });
    btn("publish").click();
    btn("yes").click();
    await waitFor(() => expect(root().querySelector('[role="status"].note')?.textContent).toBe("The change was edited after review."));
  });

  it("discard calls discard_change without a review token", async () => {
    const app = await mount();
    app.ontoolresult!({ structuredContent: detail(), _meta: { rulesVersion: "rv1" } });
    btn("discard").click();
    btn("yes").click();
    await waitFor(() => expect(root().textContent).toContain("Discarded"));
    expect(app.callServerTool).toHaveBeenCalledWith({ name: "discard_change", arguments: { change_id: "20261016-abc123", rules_version: "rv1" } });
  });

  it("only opens https preview links", async () => {
    const app = await mount();
    app.ontoolresult!({ structuredContent: detail({ previewUrl: "javascript:alert(1)" }), _meta: { rulesVersion: "rv1" } });
    expect(btn("preview").disabled).toBe(true);
    app.ontoolresult!({ structuredContent: detail(), _meta: { rulesVersion: "rv1" } });
    btn("preview").click();
    expect(app.openLink).toHaveBeenCalledWith({ url: "https://deploy-preview-3--spamtoast.netlify.app" });
  });
});

describe("other views", () => {
  it("confirm view sends confirm_change with the chosen scope", async () => {
    const app = await mount();
    app.ontoolresult!({
      structuredContent: { view: "confirm", changeId: "20261016-abc123", title: "Fix typo", state: "awaiting_ok", stateLabel: "Waiting for your OK", understoodAs: "Change the word on /about", otherPending: [] },
      _meta: { rulesVersion: "rv1" },
    });
    expect(root().textContent).toContain("Change the word on /about");
    (document.querySelector('input[value="mobile"]') as HTMLInputElement).dispatchEvent(new Event("change"));
    btn("yes-proceed").click();
    await waitFor(() => expect(app.callServerTool).toHaveBeenCalled());
    expect(app.callServerTool.mock.calls[0][0]).toEqual({ name: "confirm_change", arguments: { change_id: "20261016-abc123", applies_to: "mobile", rules_version: "rv1" } });
  });

  it("list view says when nothing is waiting", async () => {
    const app = await mount();
    app.ontoolresult!({ structuredContent: { view: "list", changes: [], olderChanges: [] } });
    expect(root().textContent).toContain("Nothing is waiting to go live.");
  });

  it("falls back to reading JSON text content, and says so when it can't", async () => {
    const app = await mount();
    app.ontoolresult!({ content: [{ type: "text", text: JSON.stringify(detail()) }], _meta: { rulesVersion: "rv1" } });
    expect(root().querySelector("h2")!.textContent).toBe("Fix typo");
    app.ontoolresult!({ content: [{ type: "text", text: "not json" }] });
    expect(root().textContent).toContain("Couldn't read this result");
  });
});
