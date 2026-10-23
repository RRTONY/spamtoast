// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/mcp/route";
import { respondToMcp } from "@/lib/admin/mcp-handler";

// The MCP server itself is replaced: these tests check the door, not the tools.
vi.mock("@/lib/admin/mcp-handler", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/mcp-handler")>()),
  respondToMcp: vi.fn(async () => new Response("ok", { status: 200 })),
}));

const TOKEN = "t".repeat(40);
const USERS = JSON.stringify([{ name: "Darryl", email: "d@example.com", role: "edit", token: TOKEN }]);

beforeEach(() => {
  vi.mocked(respondToMcp).mockResolvedValue(new Response("ok", { status: 200 }));
  vi.stubEnv("MCP_PUBLIC_ORIGIN", "https://spamtoast.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/api/mcp", () => {
  it("fails closed (500) when no team members are configured", async () => {
    vi.stubEnv("MCP_ADMIN_USERS", "");
    const res = await POST(new Request("https://spamtoast.com/api/mcp", { method: "POST", headers: { authorization: `Bearer ${TOKEN}` } }));
    expect(res.status).toBe(500);
    expect(respondToMcp).not.toHaveBeenCalled();
  });

  it("refuses a missing or wrong token with 401 and a pointer to the OAuth metadata", async () => {
    vi.stubEnv("MCP_ADMIN_USERS", USERS);
    for (const auth of [undefined, "Bearer wrong", `Basic ${TOKEN}`]) {
      const res = await POST(
        new Request("https://spamtoast.com/api/mcp", { method: "POST", headers: auth ? { authorization: auth } : {} }),
      );
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
      expect(res.headers.get("www-authenticate")).toBe(
        'Bearer resource_metadata="https://spamtoast.com/.well-known/oauth-protected-resource/api/mcp"',
      );
    }
    expect(respondToMcp).not.toHaveBeenCalled();
  });

  it("passes a request with a valid personal token through as that team member", async () => {
    vi.stubEnv("MCP_ADMIN_USERS", USERS);
    const req = new Request("https://spamtoast.com/api/mcp", { method: "GET", headers: { authorization: `Bearer ${TOKEN}` } });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(respondToMcp).toHaveBeenCalledWith(req, { name: "Darryl", email: "d@example.com", role: "edit" });
  });
});
