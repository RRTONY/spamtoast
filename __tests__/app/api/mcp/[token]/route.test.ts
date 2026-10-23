// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/mcp/[token]/route";
import { respondToMcp } from "@/lib/admin/mcp-handler";

vi.mock("@/lib/admin/mcp-handler", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/mcp-handler")>()),
  respondToMcp: vi.fn(),
}));

const TOKEN = "k".repeat(40);
const USERS = JSON.stringify([{ name: "Kimberly", email: "k@example.com", role: "read", token: TOKEN }]);
type Ctx = Parameters<typeof POST>[1];
const ctx = (token: string) => ({ params: Promise.resolve({ token }) }) as unknown as Ctx;
const req = () => new Request("https://spamtoast.com/api/mcp/x", { method: "POST" });

beforeEach(() => {
  vi.mocked(respondToMcp).mockResolvedValue(new Response("ok"));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/api/mcp/[token]", () => {
  it("fails closed (500) when MCP_ADMIN_USERS isn't set", async () => {
    vi.stubEnv("MCP_ADMIN_USERS", "");
    expect((await POST(req(), ctx(TOKEN))).status).toBe(500);
  });

  it("refuses a wrong or too-short token with 401", async () => {
    vi.stubEnv("MCP_ADMIN_USERS", USERS);
    for (const t of ["nope", "k".repeat(39), ""]) {
      const res = await POST(req(), ctx(t));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    }
    expect(respondToMcp).not.toHaveBeenCalled();
  });

  it("lets the right token in, with that person's role", async () => {
    vi.stubEnv("MCP_ADMIN_USERS", USERS);
    const r = req();
    await POST(r, ctx(TOKEN));
    expect(respondToMcp).toHaveBeenCalledWith(r, { name: "Kimberly", email: "k@example.com", role: "read" });
  });
});
