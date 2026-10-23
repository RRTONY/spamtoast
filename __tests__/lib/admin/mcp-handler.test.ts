import { describe, expect, it, vi } from "vitest";
import { createAdminMcpServer } from "@/lib/admin/mcp-server";
import { jsonError, respondToMcp } from "@/lib/admin/mcp-handler";

const transport = vi.hoisted(() => ({ handleRequest: vi.fn(), opts: null as unknown }));
vi.mock("@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js", () => ({
  WebStandardStreamableHTTPServerTransport: class {
    constructor(opts: unknown) {
      transport.opts = opts;
    }
    handleRequest(req: Request) {
      return transport.handleRequest(req);
    }
  },
}));
vi.mock("@/lib/admin/mcp-server", () => ({ createAdminMcpServer: vi.fn() }));
vi.mock("@/lib/admin/mcp-oauth", () => ({ publicOrigin: vi.fn(() => "https://spamtoast.com") }));

const user = { email: "tony@example.com", name: "Tony", role: "admin" } as never;

describe("jsonError", () => {
  it("returns a JSON error with the status", async () => {
    const res = jsonError(401, "Unauthorized");
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toBe("application/json");
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
  });
});

describe("respondToMcp", () => {
  it.each(["GET", "DELETE"])("answers %s with 405 and never builds a server", async (method) => {
    const res = await respondToMcp(new Request("https://spamtoast.com/api/mcp", { method }), user);
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
    expect((await res.json()).error.message).toMatch(/use POST/);
    expect(createAdminMcpServer).not.toHaveBeenCalled();
  });

  it("connects a fresh stateless JSON transport for POST and returns its response", async () => {
    const connect = vi.fn(async () => {});
    vi.mocked(createAdminMcpServer).mockReturnValue({ connect } as never);
    transport.handleRequest.mockResolvedValue(new Response("ok", { status: 200 }));
    const req = new Request("https://spamtoast.com/api/mcp", { method: "POST", body: "{}" });
    const res = await respondToMcp(req, user);
    expect(await res.text()).toBe("ok");
    expect(createAdminMcpServer).toHaveBeenCalledWith(user, "https://spamtoast.com");
    expect(connect).toHaveBeenCalledTimes(1);
    expect(transport.opts).toEqual({ sessionIdGenerator: undefined, enableJsonResponse: true });
    expect(transport.handleRequest).toHaveBeenCalledWith(req);
  });
});
