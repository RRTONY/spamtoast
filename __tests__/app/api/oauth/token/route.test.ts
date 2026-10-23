// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { POST, OPTIONS } from "@/app/api/oauth/token/route";
import { exchangeToken } from "@/lib/admin/mcp-oauth";

vi.mock("@/lib/admin/mcp-oauth", () => ({
  CORS_HEADERS: { "access-control-allow-origin": "*" },
  exchangeToken: vi.fn(),
  publicOrigin: vi.fn(() => "https://spamtoast.com"),
}));
const exchange = vi.mocked(exchangeToken);
const url = "https://spamtoast.com/api/oauth/token";

describe("POST /api/oauth/token", () => {
  it("reads a form body and returns the tokens, never cached", async () => {
    exchange.mockResolvedValue({ ok: true, body: { access_token: "at", token_type: "Bearer" } } as never);
    const res = await POST(new Request(url, { method: "POST", body: "grant_type=authorization_code&code=c&client_id=cid" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ access_token: "at", token_type: "Bearer" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(exchange).toHaveBeenCalledWith({ grant_type: "authorization_code", code: "c", client_id: "cid" }, { origin: expect.any(String) });
  });

  it("reads a JSON body too", async () => {
    exchange.mockResolvedValue({ ok: true, body: {} } as never);
    await POST(new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ grant_type: "refresh_token", n: 1 }) }));
    expect(exchange).toHaveBeenCalledWith({ grant_type: "refresh_token", n: "1" }, expect.anything());
  });

  it("accepts client id and secret as HTTP Basic credentials", async () => {
    exchange.mockResolvedValue({ ok: true, body: {} } as never);
    const basic = Buffer.from("my%20id:s3cret").toString("base64");
    await POST(new Request(url, { method: "POST", headers: { authorization: `Basic ${basic}` }, body: "grant_type=refresh_token" }));
    expect(exchange).toHaveBeenCalledWith(expect.objectContaining({ client_id: "my id", client_secret: "s3cret" }), expect.anything());
  });

  it("returns 401 for a bad client and 400 for any other refusal", async () => {
    exchange.mockResolvedValue({ ok: false, error: "invalid_client", description: "unknown" } as never);
    let res = await POST(new Request(url, { method: "POST", body: "" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_client", error_description: "unknown" });
    exchange.mockResolvedValue({ ok: false, error: "invalid_grant", description: "expired" } as never);
    res = await POST(new Request(url, { method: "POST", body: "" }));
    expect(res.status).toBe(400);
  });

  it("answers the CORS preflight with 204", () => {
    expect(OPTIONS().status).toBe(204);
  });
});
