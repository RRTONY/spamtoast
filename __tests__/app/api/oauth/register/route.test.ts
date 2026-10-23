// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { POST, OPTIONS } from "@/app/api/oauth/register/route";
import { registerClient } from "@/lib/admin/mcp-oauth";

vi.mock("@/lib/admin/mcp-oauth", () => ({
  CORS_HEADERS: { "access-control-allow-origin": "*" },
  registerClient: vi.fn(),
}));
const register = vi.mocked(registerClient);

const req = (body: string) => new Request("https://spamtoast.com/api/oauth/register", { method: "POST", body });

describe("POST /api/oauth/register", () => {
  it("rejects a callback that isn't allowed with 400", async () => {
    register.mockReturnValue({ error: "redirect_uri not allowed" } as never);
    const res = await POST(req(JSON.stringify({ redirect_uris: ["https://evil.com/cb"] })));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_redirect_uri", error_description: "redirect_uri not allowed" });
  });

  it("doesn't crash on a body that isn't JSON", async () => {
    register.mockReturnValue({ error: "no redirect" } as never);
    const res = await POST(req("not json"));
    expect(res.status).toBe(400);
    expect(register).toHaveBeenCalledWith({});
  });

  it("returns 201 with the client id, and the secret only when one was issued", async () => {
    register.mockReturnValue({
      clientId: "cid",
      client: { name: "Claude", redirectUris: ["https://claude.ai/cb"], authMethod: "none" },
    } as never);
    let res = await POST(req(JSON.stringify({ redirect_uris: ["https://claude.ai/cb"] })));
    expect(res.status).toBe(201);
    let body = await res.json();
    expect(body).toMatchObject({ client_id: "cid", client_name: "Claude", redirect_uris: ["https://claude.ai/cb"], token_endpoint_auth_method: "none" });
    expect(body).not.toHaveProperty("client_secret");

    register.mockReturnValue({
      clientId: "cid2",
      clientSecret: "sek",
      client: { name: "", redirectUris: ["https://chatgpt.com/cb"], authMethod: "client_secret_post" },
    } as never);
    res = await POST(req("{}"));
    body = await res.json();
    expect(body).toMatchObject({ client_secret: "sek", client_secret_expires_at: 0 });
    expect(body.client_name).toBeUndefined();
  });

  it("answers the CORS preflight with 204", () => {
    expect(OPTIONS().status).toBe(204);
  });
});
