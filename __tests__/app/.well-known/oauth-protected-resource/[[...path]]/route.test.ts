// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, OPTIONS } from "@/app/.well-known/oauth-protected-resource/[[...path]]/route";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/.well-known/oauth-protected-resource", () => {
  it("names /api/mcp as the resource and this site as its sign-in server", async () => {
    vi.stubEnv("MCP_PUBLIC_ORIGIN", "");
    const res = GET(new Request("https://spamtoast.com/.well-known/oauth-protected-resource/api/mcp"));
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(await res.json()).toMatchObject({
      resource: "https://spamtoast.com/api/mcp",
      authorization_servers: ["https://spamtoast.com"],
      bearer_methods_supported: ["header"],
    });
  });

  it("follows the forwarded host (deploy previews)", async () => {
    vi.stubEnv("MCP_PUBLIC_ORIGIN", "");
    vi.stubEnv("URL", "");
    const req = new Request("http://localhost/.well-known/oauth-protected-resource", {
      headers: { "x-forwarded-host": "preview.example.com", "x-forwarded-proto": "https" },
    });
    expect((await GET(req).json()).resource).toBe("https://preview.example.com/api/mcp");
  });

  it("answers the CORS preflight with 204", () => {
    expect(OPTIONS().status).toBe(204);
  });
});
