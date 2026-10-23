// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, OPTIONS } from "@/app/.well-known/oauth-authorization-server/[[...path]]/route";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/.well-known/oauth-authorization-server", () => {
  it("points Claude/ChatGPT at this site's sign-in, token and registration endpoints", async () => {
    vi.stubEnv("MCP_PUBLIC_ORIGIN", "");
    const res = GET(new Request("https://spamtoast.com/.well-known/oauth-authorization-server"));
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const body = await res.json();
    expect(body).toMatchObject({
      issuer: "https://spamtoast.com",
      authorization_endpoint: "https://spamtoast.com/oauth/authorize",
      token_endpoint: "https://spamtoast.com/api/oauth/token",
      registration_endpoint: "https://spamtoast.com/api/oauth/register",
      code_challenge_methods_supported: ["S256"],
    });
  });

  it("uses MCP_PUBLIC_ORIGIN over the internal request address", async () => {
    vi.stubEnv("MCP_PUBLIC_ORIGIN", "https://spamtoast.com/");
    const body = await GET(new Request("https://main--site.netlify.app/.well-known/oauth-authorization-server")).json();
    expect(body.issuer).toBe("https://spamtoast.com");
  });

  it("answers the CORS preflight with 204", () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });
});
