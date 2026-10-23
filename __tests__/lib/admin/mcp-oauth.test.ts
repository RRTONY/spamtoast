import { createHash, createSign, generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as oauth from "@/lib/admin/mcp-oauth";

const T1 = "t".repeat(40);
const USERS = JSON.stringify([
  { name: "Tony", email: "tony@example.com", role: "write" },
  { name: "Bot", role: "edit", token: T1 },
]);
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const VERIFIER = "v".repeat(50);
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

beforeEach(() => {
  vi.stubEnv("MCP_OAUTH_SECRET", "s3cret");
  vi.stubEnv("MCP_LOGIN_PASSWORD", "team-password");
  vi.stubEnv("MCP_ADMIN_USERS", USERS);
  vi.spyOn(console, "error").mockImplementation(() => {});
  oauth.clearRemoteClientCachesForTests();
  oauth.resetLoginFailuresForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

function client(method?: string) {
  const r = oauth.registerClient({ redirect_uris: [REDIRECT], client_name: "Claude", token_endpoint_auth_method: method });
  if ("error" in r) throw new Error(r.error);
  return r;
}
function params(clientId: string): oauth.AuthorizeParams {
  return { clientId, redirectUri: REDIRECT, state: "s", codeChallenge: CHALLENGE, scope: "mcp", resource: "" };
}

describe("signed blobs", () => {
  it("round-trip and refuse tampering, the wrong kind and expiry", () => {
    const blob = oauth.signBlob("at", { e: "a@x.com" });
    expect(blob.startsWith("tgmcp_at.")).toBe(true);
    expect(oauth.verifyBlob("at", blob)).toEqual({ e: "a@x.com" });
    expect(oauth.verifyBlob("rt", blob)).toBeNull();
    const [p, body, sig] = blob.split(".");
    const forged = Buffer.from(JSON.stringify({ e: "evil@x.com" })).toString("base64url");
    expect(oauth.verifyBlob("at", `${p}.${forged}.${sig}`)).toBeNull();
    expect(oauth.verifyBlob("at", `${p}.${body}.${sig.slice(0, -2)}xx`)).toBeNull();
    expect(oauth.verifyBlob("at", 42)).toBeNull();
    expect(oauth.verifyBlob("at", oauth.signBlob("at", { exp: Math.floor(Date.now() / 1000) - 1 }))).toBeNull();
  });

  it("a blob of one kind relabelled as another fails (each kind has its own key)", () => {
    const [, body, sig] = oauth.signBlob("code", { e: "a" }).split(".");
    expect(oauth.verifyBlob("at", `tgmcp_at.${body}.${sig}`)).toBeNull();
  });

  it("changing the login password invalidates tokens but not client registrations", () => {
    const at = oauth.signBlob("at", { e: "a" });
    const { clientId } = client();
    vi.stubEnv("MCP_LOGIN_PASSWORD", "new-password");
    expect(oauth.verifyBlob("at", at)).toBeNull();
    expect(oauth.readClient(clientId)).not.toBeNull();
  });

  it("refuses to sign without MCP_OAUTH_SECRET", () => {
    vi.stubEnv("MCP_OAUTH_SECRET", "");
    expect(() => oauth.signBlob("at", {})).toThrow("MCP_OAUTH_SECRET is not set");
  });
});

describe("redirect URIs", () => {
  it("allows only ChatGPT, Claude and localhost callbacks", () => {
    expect(oauth.isAllowedRedirectUri("https://chatgpt.com/connector/cb")).toBe(true);
    expect(oauth.isAllowedRedirectUri(REDIRECT)).toBe(true);
    expect(oauth.isAllowedRedirectUri("http://localhost:3333/cb")).toBe(true);
    expect(oauth.isAllowedRedirectUri("http://127.0.0.1:9/cb")).toBe(true);
    for (const bad of ["https://evil.com/cb", "http://claude.ai/cb", "https://claude.ai.evil.com/cb", "https://claude.ai/cb#frag", "javascript:alert(1)", "not a url", "http://localhost.evil.com/cb"]) {
      expect(oauth.isAllowedRedirectUri(bad), bad).toBe(false);
    }
  });

  it("extra hosts come from MCP_OAUTH_REDIRECT_HOSTS", () => {
    vi.stubEnv("MCP_OAUTH_REDIRECT_HOSTS", " Example.org ,");
    expect(oauth.isAllowedRedirectUri("https://example.org/cb")).toBe(true);
  });

  it("names the app from where the code goes, not what it calls itself", () => {
    expect(oauth.appNameForRedirect("https://chatgpt.com/x")).toBe("ChatGPT");
    expect(oauth.appNameForRedirect(REDIRECT)).toBe("Claude");
    expect(oauth.appNameForRedirect("http://localhost:1/x")).toMatch(/this computer/);
    expect(oauth.appNameForRedirect("nope")).toBe("an AI app");
  });
});

describe("registerClient / readClient", () => {
  it("issues a public client, or a confidential one with a derived secret", () => {
    const pub = client();
    expect(pub.client).toEqual({ redirectUris: [REDIRECT], name: "Claude", authMethod: "none" });
    expect(pub).not.toHaveProperty("clientSecret");
    expect(oauth.readClient(pub.clientId)).toEqual(pub.client);
    const conf = client("client_secret_post");
    expect(conf.clientSecret).toBe(oauth.clientSecretFor(conf.clientId));
  });

  it("refuses missing or disallowed redirect URIs", () => {
    expect(oauth.registerClient({})).toEqual({ error: "redirect_uris is required" });
    expect(oauth.registerClient({ redirect_uris: [REDIRECT, "https://evil.com/cb"] })).toEqual({ error: "redirect_uri not allowed: https://evil.com/cb" });
  });

  it("readClient refuses garbage", () => {
    expect(oauth.readClient("tgmcp_client.x.y")).toBeNull();
    expect(oauth.readClient(undefined)).toBeNull();
  });
});

describe("validateAuthorizeRequest", () => {
  const good = (clientId: string) => ({ response_type: "code", client_id: clientId, redirect_uri: REDIRECT, code_challenge: CHALLENGE, code_challenge_method: "S256", state: "xyz" });

  it("accepts a well-formed request", async () => {
    const { clientId } = client();
    await expect(oauth.validateAuthorizeRequest(good(clientId))).resolves.toEqual({
      params: { clientId, redirectUri: REDIRECT, state: "xyz", codeChallenge: CHALLENGE, scope: "mcp", resource: "" },
      appName: "Claude",
    });
  });

  it("refuses the wrong response type, unknown client, foreign redirect and missing/plain PKCE", async () => {
    const { clientId } = client();
    expect(await oauth.validateAuthorizeRequest({ ...good(clientId), response_type: "token" })).toHaveProperty("error");
    expect(await oauth.validateAuthorizeRequest({ ...good(clientId), client_id: "bogus" })).toHaveProperty("error");
    expect(await oauth.validateAuthorizeRequest({ ...good(clientId), redirect_uri: "https://chatgpt.com/other" })).toHaveProperty("error");
    expect(await oauth.validateAuthorizeRequest({ ...good(clientId), code_challenge_method: "plain" })).toHaveProperty("error");
    expect(await oauth.validateAuthorizeRequest({ ...good(clientId), code_challenge: undefined })).toHaveProperty("error");
  });
});

describe("login", () => {
  it("needs both a team email and the shared password", () => {
    expect(oauth.login("TONY@example.com", "team-password")).toEqual({ name: "Tony", email: "tony@example.com", role: "write" });
    expect(oauth.login("tony@example.com", "wrong")).toBeNull();
    expect(oauth.login("stranger@example.com", "team-password")).toBeNull();
  });

  it("nobody can sign in when no password is configured", () => {
    vi.stubEnv("MCP_LOGIN_PASSWORD", "");
    expect(oauth.verifyLoginPassword("")).toBe(false);
    expect(oauth.login("tony@example.com", "")).toBeNull();
  });
});

describe("pkceMatches", () => {
  it("checks the S256 challenge and the verifier format", () => {
    expect(oauth.pkceMatches(VERIFIER, CHALLENGE)).toBe(true);
    expect(oauth.pkceMatches("w".repeat(50), CHALLENGE)).toBe(false);
    expect(oauth.pkceMatches("short", createHash("sha256").update("short").digest("base64url"))).toBe(false);
  });
});

describe("exchangeToken", () => {
  it("swaps a valid code for tokens that authenticate the user", async () => {
    const { clientId } = client();
    const code = oauth.issueAuthCode(params(clientId), "Tony@Example.com");
    const r = await oauth.exchangeToken({ grant_type: "authorization_code", client_id: clientId, code, redirect_uri: REDIRECT, code_verifier: VERIFIER });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "mcp" });
    expect(oauth.authenticateMcpBearer(r.body.access_token)).toEqual({ name: "Tony", email: "tony@example.com", role: "write" });
    const refreshed = await oauth.exchangeToken({ grant_type: "refresh_token", client_id: clientId, refresh_token: r.body.refresh_token });
    expect(refreshed.ok).toBe(true);
  });

  it("refuses an unknown client, a bad code, another client's code, a redirect mismatch and a wrong verifier", async () => {
    const { clientId } = client();
    const otherReg = oauth.registerClient({ redirect_uris: [REDIRECT], client_name: "Another app" });
    if ("error" in otherReg) throw new Error(otherReg.error);
    const other = otherReg.clientId;
    const code = oauth.issueAuthCode(params(clientId), "tony@example.com");
    const base = { grant_type: "authorization_code", client_id: clientId, code, redirect_uri: REDIRECT, code_verifier: VERIFIER };
    const desc = async (f: Record<string, string>) => {
      const r = await oauth.exchangeToken(f);
      return r.ok ? "ok" : r.description;
    };
    expect(await desc({ ...base, client_id: "nope" })).toBe("Unknown client_id");
    expect(await desc({ ...base, code: "tgmcp_code.x.y" })).toBe("Code is invalid or expired");
    expect(await desc({ ...base, client_id: other })).toBe("Code was issued to a different client");
    expect(await desc({ ...base, redirect_uri: "https://claude.ai/other" })).toBe("redirect_uri mismatch");
    expect(await desc({ ...base, code_verifier: "x".repeat(50) })).toBe("PKCE check failed");
    expect(await desc({ ...base, grant_type: "password" })).toBe("Use authorization_code or refresh_token");
  });

  it("refuses an access token used as a refresh token", async () => {
    const { clientId } = client();
    const at = oauth.signBlob("at", { e: "tony@example.com", exp: Math.floor(Date.now() / 1000) + 60 });
    const r = await oauth.exchangeToken({ grant_type: "refresh_token", client_id: clientId, refresh_token: at });
    expect(r).toMatchObject({ ok: false, error: "invalid_grant" });
  });

  it("cuts off someone removed from the team on code exchange, refresh and every request", async () => {
    const { clientId } = client();
    const code = oauth.issueAuthCode(params(clientId), "tony@example.com");
    const r = await oauth.exchangeToken({ grant_type: "authorization_code", client_id: clientId, code, redirect_uri: REDIRECT, code_verifier: VERIFIER });
    if (!r.ok) throw new Error("expected tokens");
    vi.stubEnv("MCP_ADMIN_USERS", "[]");
    expect(oauth.userFromAccessToken(r.body.access_token)).toBeNull();
    expect(await oauth.exchangeToken({ grant_type: "refresh_token", client_id: clientId, refresh_token: r.body.refresh_token })).toMatchObject({ ok: false, description: "No longer a team member" });
    expect(await oauth.exchangeToken({ grant_type: "authorization_code", client_id: clientId, code, redirect_uri: REDIRECT, code_verifier: VERIFIER })).toMatchObject({ ok: false, description: "No longer a team member" });
  });

  it("an expired code is refused", async () => {
    vi.useFakeTimers();
    const { clientId } = client();
    const code = oauth.issueAuthCode(params(clientId), "tony@example.com");
    vi.advanceTimersByTime((oauth.AUTH_CODE_TTL_S + 1) * 1000);
    expect(await oauth.exchangeToken({ grant_type: "authorization_code", client_id: clientId, code, redirect_uri: REDIRECT, code_verifier: VERIFIER })).toMatchObject({ ok: false, description: "Code is invalid or expired" });
  });

  it("confidential clients must send their secret", async () => {
    const { clientId, clientSecret } = client("client_secret_basic");
    const code = oauth.issueAuthCode(params(clientId), "tony@example.com");
    const form = { grant_type: "authorization_code", client_id: clientId, code, redirect_uri: REDIRECT, code_verifier: VERIFIER };
    expect(await oauth.exchangeToken(form)).toMatchObject({ ok: false, error: "invalid_client" });
    expect(await oauth.exchangeToken({ ...form, client_secret: "wrong" })).toMatchObject({ ok: false, error: "invalid_client" });
    expect((await oauth.exchangeToken({ ...form, client_secret: clientSecret })).ok).toBe(true);
  });
});

describe("client metadata documents and private_key_jwt", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1" };
  const CID = "https://chatgpt.com/oauth/client.json";
  const JWKS = "https://chatgpt.com/oauth/jwks.json";
  const ORIGIN = "https://spamtoast.com";
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const assertion = (claims: object, kid = "k1") => {
    const h = b64({ alg: "RS256", kid });
    const c = b64(claims);
    return `${h}.${c}.${createSign("RSA-SHA256").update(`${h}.${c}`).sign(privateKey).toString("base64url")}`;
  };
  const claims = () => ({ iss: CID, sub: CID, aud: `${ORIGIN}/api/oauth/token`, exp: Math.floor(Date.now() / 1000) + 60 });

  function stubRemote(doc: object) {
    const fetchMock = vi.fn(async (url: string) =>
      new Response(JSON.stringify(url === CID ? doc : url === JWKS ? { keys: [jwk] } : {}), { status: url === CID || url === JWKS ? 200 : 404 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("resolves a trusted metadata document, keeping only allowed redirect URIs", async () => {
    stubRemote({ client_id: CID, redirect_uris: ["https://chatgpt.com/cb", "https://evil.com/cb"], client_name: "ChatGPT", token_endpoint_auth_method: "private_key_jwt", jwks_uri: JWKS });
    await expect(oauth.resolveClient(CID)).resolves.toEqual({ redirectUris: ["https://chatgpt.com/cb"], name: "ChatGPT", authMethod: "private_key_jwt", jwksUri: JWKS });
  });

  it("never fetches a metadata document from an untrusted host", async () => {
    const fetchMock = stubRemote({});
    await expect(oauth.resolveClient("https://evil.com/client.json")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a document whose client_id doesn't match its URL, or with an untrusted jwks_uri", async () => {
    stubRemote({ client_id: "https://chatgpt.com/other.json", redirect_uris: ["https://chatgpt.com/cb"] });
    await expect(oauth.resolveClient(CID)).resolves.toBeNull();
    oauth.clearRemoteClientCachesForTests();
    stubRemote({ client_id: CID, redirect_uris: ["https://chatgpt.com/cb"], token_endpoint_auth_method: "private_key_jwt", jwks_uri: "https://evil.com/jwks" });
    await expect(oauth.resolveClient(CID)).resolves.toBeNull();
  });

  it("verifies a correctly signed client assertion and refuses wrong issuer, audience, expiry or key", async () => {
    stubRemote({});
    const aud = [`${ORIGIN}/api/oauth/token`, ORIGIN];
    await expect(oauth.verifyClientAssertion(CID, JWKS, assertion(claims()), aud)).resolves.toBe(true);
    await expect(oauth.verifyClientAssertion(CID, JWKS, assertion({ ...claims(), iss: "https://evil.com" }), aud)).resolves.toBe(false);
    await expect(oauth.verifyClientAssertion(CID, JWKS, assertion({ ...claims(), aud: "https://other.com" }), aud)).resolves.toBe(false);
    await expect(oauth.verifyClientAssertion(CID, JWKS, assertion({ ...claims(), exp: Math.floor(Date.now() / 1000) - 120 }), aud)).resolves.toBe(false);
    await expect(oauth.verifyClientAssertion(CID, JWKS, assertion(claims(), "unknown-kid"), aud)).resolves.toBe(false);
    const [h, c] = assertion(claims()).split(".");
    await expect(oauth.verifyClientAssertion(CID, JWKS, `${h}.${c}.AAAA`, aud)).resolves.toBe(false);
    await expect(oauth.verifyClientAssertion(CID, JWKS, undefined, aud)).resolves.toBe(false);
    const none = `${b64({ alg: "none" })}.${b64(claims())}.`;
    await expect(oauth.verifyClientAssertion(CID, JWKS, none, aud)).resolves.toBe(false);
  });

  it("exchangeToken requires the assertion for a private_key_jwt client", async () => {
    stubRemote({ client_id: CID, redirect_uris: ["https://chatgpt.com/cb"], token_endpoint_auth_method: "private_key_jwt", jwks_uri: JWKS });
    const p = { ...params(CID), redirectUri: "https://chatgpt.com/cb" };
    const code = oauth.issueAuthCode(p, "tony@example.com");
    const form = { grant_type: "authorization_code", client_id: CID, code, redirect_uri: "https://chatgpt.com/cb", code_verifier: VERIFIER };
    expect(await oauth.exchangeToken(form, { origin: ORIGIN })).toMatchObject({ ok: false, error: "invalid_client" });
    const ok = await oauth.exchangeToken(
      { ...form, client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer", client_assertion: assertion(claims()) },
      { origin: ORIGIN },
    );
    expect(ok.ok).toBe(true);
  });
});

describe("authenticateMcpBearer", () => {
  it("accepts personal tokens and OAuth access tokens, nothing else", () => {
    expect(oauth.authenticateMcpBearer(T1)).toEqual({ name: "Bot", email: "", role: "edit" });
    expect(oauth.authenticateMcpBearer("")).toBeNull();
    expect(oauth.authenticateMcpBearer("tgmcp_at.forged.sig")).toBeNull();
    expect(oauth.isOAuthAccessToken(oauth.signBlob("at", { e: "x" }))).toBe(true);
    expect(oauth.isOAuthAccessToken(T1)).toBe(false);
  });
});

describe("metadata", () => {
  it("advertises the resource, endpoints and S256", () => {
    expect(oauth.protectedResourceMetadata("https://o")).toMatchObject({ resource: "https://o/api/mcp", authorization_servers: ["https://o"] });
    const m = oauth.authorizationServerMetadata("https://o");
    expect(m).toMatchObject({ issuer: "https://o", token_endpoint: "https://o/api/oauth/token", code_challenge_methods_supported: ["S256"] });
    expect(oauth.wwwAuthenticateHeader("https://o")).toBe('Bearer resource_metadata="https://o/.well-known/oauth-protected-resource/api/mcp"');
  });
});

describe("login lockout", () => {
  it("locks an IP or an email after 8 failures in 15 minutes, then unlocks", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 7; i++) oauth.recordLoginFailure("1.2.3.4", `u${i}@x.com`);
    expect(oauth.isLoginLocked("1.2.3.4", "new@x.com")).toBe(false);
    oauth.recordLoginFailure("1.2.3.4", "u7@x.com");
    expect(oauth.isLoginLocked("1.2.3.4", "new@x.com")).toBe(true);
    for (let i = 0; i < 8; i++) oauth.recordLoginFailure(`9.9.9.${i}`, "Target@x.com");
    expect(oauth.isLoginLocked("5.5.5.5", "target@x.com")).toBe(true);
    vi.advanceTimersByTime(15 * 60 * 1000 + 1);
    expect(oauth.isLoginLocked("1.2.3.4", "target@x.com")).toBe(false);
  });

  it("clientIp prefers Netlify's header, then the first forwarded address", () => {
    expect(oauth.clientIp(new Request("https://x", { headers: { "x-nf-client-connection-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" } }))).toBe("1.1.1.1");
    expect(oauth.clientIp(new Request("https://x", { headers: { "x-forwarded-for": "3.3.3.3, 4.4.4.4" } }))).toBe("3.3.3.3");
    expect(oauth.clientIp(new Request("https://x"))).toBe("unknown");
  });
});

describe("publicOrigin", () => {
  it("uses MCP_PUBLIC_ORIGIN first", () => {
    vi.stubEnv("MCP_PUBLIC_ORIGIN", "https://spamtoast.com/");
    expect(oauth.publicOrigin(new Request("https://main--x.netlify.app/api/mcp"))).toBe("https://spamtoast.com");
  });

  it("uses forwarded host/proto, ignoring malformed ones", () => {
    expect(oauth.publicOrigin(new Request("https://internal/api", { headers: { "x-forwarded-host": "spamtoast.com", "x-forwarded-proto": "https" } }))).toBe("https://spamtoast.com");
    expect(oauth.publicOrigin(new Request("https://internal/api", { headers: { "x-forwarded-host": "evil.com/path", "x-forwarded-proto": "https" } }))).toBe("https://internal");
  });

  it("swaps a netlify.app address for Netlify's main URL", () => {
    vi.stubEnv("URL", "https://spamtoast.com");
    expect(oauth.publicOrigin(new Request("https://main--site.netlify.app/api/mcp"))).toBe("https://spamtoast.com");
  });
});
