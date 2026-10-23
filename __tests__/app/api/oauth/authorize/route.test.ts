// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/oauth/authorize/route";
import * as oauth from "@/lib/admin/mcp-oauth";

vi.mock("@/lib/admin/mcp-oauth", () => ({
  clientIp: vi.fn(() => "1.2.3.4"),
  isLoginLocked: vi.fn(() => false),
  issueAuthCode: vi.fn(() => "CODE123"),
  login: vi.fn(() => null),
  recordLoginFailure: vi.fn(),
  validateAuthorizeRequest: vi.fn(),
  publicOrigin: vi.fn(() => "https://spamtoast.com"),
}));
const m = vi.mocked(oauth);

const PARAMS = { clientId: "c1", redirectUri: "https://claude.ai/api/mcp/auth_callback", state: "st", codeChallenge: "cc", scope: "mcp" };
function post(fields: Record<string, string>) {
  return POST(new Request("https://spamtoast.com/api/oauth/authorize", { method: "POST", body: new URLSearchParams(fields).toString() }));
}

beforeEach(() => {
  m.clientIp.mockReturnValue("1.2.3.4");
  m.isLoginLocked.mockReturnValue(false);
  m.issueAuthCode.mockReturnValue("CODE123");
  m.publicOrigin.mockReturnValue("https://spamtoast.com");
  m.validateAuthorizeRequest.mockResolvedValue({ params: PARAMS } as never);
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("POST /api/oauth/authorize", () => {
  it("sends an invalid request back to the sign-in page with the reason", async () => {
    m.validateAuthorizeRequest.mockResolvedValue({ error: "unknown client" } as never);
    const res = await post({ client_id: "x" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://spamtoast.com/oauth/authorize?invalid=unknown%20client");
    expect(m.login).not.toHaveBeenCalled();
  });

  it("on a wrong password: records the failure and goes back with the email, never the password", async () => {
    const res = await post({ client_id: "c1", state: "st", email: " d@example.com ", password: "hunter2" });
    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/oauth/authorize");
    expect(loc.searchParams.get("error")).toBe("invalid");
    expect(loc.searchParams.get("email")).toBe("d@example.com");
    expect(loc.searchParams.get("client_id")).toBe("c1");
    expect(loc.toString()).not.toContain("hunter2");
    expect(m.recordLoginFailure).toHaveBeenCalledWith("1.2.3.4", "d@example.com");
  });

  it("refuses to even try the password once the address is locked out", async () => {
    m.isLoginLocked.mockReturnValue(true);
    const res = await post({ email: "d@example.com", password: "right" });
    expect(new URL(res.headers.get("location")!).searchParams.get("error")).toBe("locked");
    expect(m.login).not.toHaveBeenCalled();
  });

  it("on success redirects to the app's callback with a code, the state and the issuer", async () => {
    m.login.mockReturnValue({ name: "Darryl", email: "d@example.com", role: "edit" });
    const res = await post({ email: "d@example.com", password: "right" });
    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.origin + loc.pathname).toBe("https://claude.ai/api/mcp/auth_callback");
    expect(loc.searchParams.get("code")).toBe("CODE123");
    expect(loc.searchParams.get("state")).toBe("st");
    expect(loc.searchParams.get("iss")).toBe("https://spamtoast.com");
    expect(m.issueAuthCode).toHaveBeenCalledWith(PARAMS, "d@example.com");
  });
});
