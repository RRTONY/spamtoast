import {
  createHash,
  createHmac,
  createPublicKey,
  timingSafeEqual,
  verify as verifySignature,
  type JsonWebKey as CryptoJwk,
} from "crypto";
import {
  authenticateMcpToken,
  findMcpUserByEmail,
  type McpUser,
} from "@/lib/admin/mcp-auth";

// OAuth 2.1 sign-in for the MCP server, so a team member connects Claude or
// ChatGPT by just adding https://spamtoast.com/api/mcp, signing in on our
// own page (/oauth/authorize), and never copying a token. Same design as the
// tonygreenberg.com server, with its own signing secret.
// Implements the pieces the MCP authorization spec requires:
// protected-resource + authorization-server metadata, dynamic client
// registration, authorization code + PKCE (S256), and refresh tokens.
//
// Stateless (Netlify functions keep nothing between requests): every
// client id, auth code, access token and refresh token is a small signed
// blob instead of a database row. Each kind is signed with its own derived
// key, so one can never be passed off as another. Codes, access and refresh
// tokens are also keyed to MCP_LOGIN_PASSWORD, so changing that password
// signs everyone out at once. Removing someone from MCP_ADMIN_USERS cuts
// them off on their very next request, since every request looks the
// person up again by email.

export const ACCESS_TOKEN_TTL_S = 60 * 60;
export const REFRESH_TOKEN_TTL_S = 30 * 24 * 60 * 60;
export const AUTH_CODE_TTL_S = 5 * 60;

// "upload": a short-lived link to drop one file into one change
// (binary-upload.ts).
type Kind = "client" | "code" | "at" | "rt" | "upload";
const PREFIX: Record<Kind, string> = {
  client: "tgmcp_client",
  code: "tgmcp_code",
  at: "tgmcp_at",
  rt: "tgmcp_rt",
  upload: "tgmcp_up",
};

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

function signingKey(kind: Kind): Buffer {
  const secret = process.env.MCP_OAUTH_SECRET;
  if (!secret) throw new Error("MCP_OAUTH_SECRET is not set");
  // Client registrations deliberately survive a password change (ChatGPT
  // and Claude keep their registered client id); everything a person holds
  // after signing in does not.
  const password =
    kind === "client" ? "" : (process.env.MCP_LOGIN_PASSWORD ?? "");
  return createHmac("sha256", secret)
    .update(`mcp-oauth:${kind}:${password}`)
    .digest();
}

export function signBlob(kind: Kind, payload: Record<string, unknown>): string {
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(
    createHmac("sha256", signingKey(kind)).update(body).digest(),
  );
  return `${PREFIX[kind]}.${body}.${sig}`;
}

export function verifyBlob<T extends Record<string, unknown>>(
  kind: Kind,
  value: unknown,
): T | null {
  if (typeof value !== "string") return null;
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX[kind]) return null;
  const [, body, sig] = parts;
  const expected = b64url(
    createHmac("sha256", signingKey(kind)).update(body).digest(),
  );
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload: T;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const exp = payload.exp;
  if (typeof exp === "number" && exp < Math.floor(Date.now() / 1000))
    return null;
  return payload;
}

const now = () => Math.floor(Date.now() / 1000);

// Only real ChatGPT / Claude sign-in callbacks (plus local apps such as
// Claude Code, which listen on localhost) may receive a login code. Without
// this, anyone could register a look-alike "connector" and use our genuine
// sign-in page to collect a team member's access.
const ALLOWED_REDIRECT_HOSTS = [
  "chatgpt.com",
  "chat.openai.com",
  "claude.ai",
  "claude.com",
];

function trustedHosts(): string[] {
  const extra = (process.env.MCP_OAUTH_REDIRECT_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return [...ALLOWED_REDIRECT_HOSTS, ...extra];
}

export function isAllowedRedirectUri(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash) return false;
  const host = url.hostname.toLowerCase();
  if (
    url.protocol === "http:" &&
    (host === "localhost" || host === "127.0.0.1")
  ) {
    return true;
  }
  if (url.protocol !== "https:") return false;
  return trustedHosts().includes(host);
}

export function appNameForRedirect(uri: string): string {
  try {
    const host = new URL(uri).hostname;
    if (host.includes("openai") || host.includes("chatgpt")) return "ChatGPT";
    if (host.includes("claude")) return "Claude";
    if (host === "localhost" || host === "127.0.0.1")
      return "an app on this computer (e.g. Claude Code)";
  } catch {
    // fall through
  }
  return "an AI app";
}

// --- Dynamic client registration -------------------------------------------

export type ClientAuthMethod =
  "none" | "client_secret_basic" | "client_secret_post" | "private_key_jwt";

export interface RegisteredClient {
  redirectUris: string[];
  name: string;
  authMethod: ClientAuthMethod;
  // Only for client-metadata-document clients using private_key_jwt.
  jwksUri?: string;
}

// Clients that register asking for a secret (ChatGPT can) get one. It is
// derived from the client id rather than stored - still stateless - and is
// checked at the token endpoint. Answering "none" to a client that asked
// for a secret made ChatGPT abandon setup ("Couldn't create MCP app").
export function clientSecretFor(clientId: string): string {
  const secret = process.env.MCP_OAUTH_SECRET;
  if (!secret) throw new Error("MCP_OAUTH_SECRET is not set");
  return createHmac("sha256", secret)
    .update(`mcp-oauth:client-secret:${clientId}`)
    .digest("base64url");
}

function secretMatches(
  clientId: string,
  provided: string | undefined,
): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(clientSecretFor(clientId));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function registerClient(input: {
  redirect_uris?: unknown;
  client_name?: unknown;
  token_endpoint_auth_method?: unknown;
}):
  | { clientId: string; client: RegisteredClient; clientSecret?: string }
  | { error: string } {
  const uris = Array.isArray(input.redirect_uris)
    ? input.redirect_uris.filter((u): u is string => typeof u === "string")
    : [];
  if (uris.length === 0) return { error: "redirect_uris is required" };
  const bad = uris.find((u) => !isAllowedRedirectUri(u));
  if (bad) return { error: `redirect_uri not allowed: ${bad}` };
  const name =
    typeof input.client_name === "string"
      ? input.client_name.slice(0, 100)
      : "";
  const requested = input.token_endpoint_auth_method;
  const authMethod: ClientAuthMethod =
    requested === "client_secret_basic" || requested === "client_secret_post"
      ? requested
      : "none";
  const client: RegisteredClient = { redirectUris: uris, name, authMethod };
  const clientId = signBlob("client", {
    r: uris,
    n: name,
    a: authMethod,
    iat: now(),
  });
  return {
    clientId,
    client,
    ...(authMethod === "none"
      ? {}
      : { clientSecret: clientSecretFor(clientId) }),
  };
}

export function readClient(clientId: unknown): RegisteredClient | null {
  const p = verifyBlob<{ r: string[]; n: string; a?: ClientAuthMethod }>(
    "client",
    clientId,
  );
  if (!p || !Array.isArray(p.r)) return null;
  return { redirectUris: p.r, name: p.n ?? "", authMethod: p.a ?? "none" };
}

// --- Client ID metadata documents (CIMD) ----------------------------------
// ChatGPT's preferred registration: its client_id IS a URL
// (https://chatgpt.com/oauth/client.json) pointing at a JSON document with
// its redirect URIs and signing keys, instead of calling our
// registration_endpoint. We only fetch such documents from the same
// trusted hosts allowed as sign-in callbacks, and the document's own
// redirect_uris still have to pass isAllowedRedirectUri.

const REMOTE_TTL_MS = 10 * 60 * 1000;
const cimdCache = new Map<
  string,
  { client: RegisteredClient | null; at: number }
>();
const jwksCache = new Map<string, { keys: CryptoJwk[]; at: number }>();

function isTrustedHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.hash &&
      trustedHosts().includes(u.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

async function fetchJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function clearRemoteClientCachesForTests(): void {
  cimdCache.clear();
  jwksCache.clear();
}

async function readClientDocument(
  url: string,
): Promise<RegisteredClient | null> {
  const hit = cimdCache.get(url);
  if (hit && Date.now() - hit.at < REMOTE_TTL_MS) return hit.client;

  const doc = (await fetchJson(url)) as Record<string, unknown> | null;
  let client: RegisteredClient | null = null;
  if (doc && doc.client_id === url && Array.isArray(doc.redirect_uris)) {
    const uris = doc.redirect_uris.filter(
      (u): u is string => typeof u === "string" && isAllowedRedirectUri(u),
    );
    const method = doc.token_endpoint_auth_method;
    const jwksUri = typeof doc.jwks_uri === "string" ? doc.jwks_uri : "";
    const methodOk =
      method === undefined ||
      method === "none" ||
      (method === "private_key_jwt" && isTrustedHttpsUrl(jwksUri));
    if (uris.length > 0 && methodOk) {
      client = {
        redirectUris: uris,
        name:
          typeof doc.client_name === "string"
            ? doc.client_name.slice(0, 100)
            : "",
        authMethod: method === "private_key_jwt" ? "private_key_jwt" : "none",
        ...(method === "private_key_jwt" ? { jwksUri } : {}),
      };
    }
  }
  // Only cache successes, so a one-off network blip doesn't lock the
  // client out for ten minutes.
  if (client) cimdCache.set(url, { client, at: Date.now() });
  return client;
}

// Registered (signed-blob) client or a trusted client metadata document.
export async function resolveClient(
  clientId: unknown,
): Promise<RegisteredClient | null> {
  if (typeof clientId === "string" && clientId.startsWith("https://")) {
    return isTrustedHttpsUrl(clientId) ? readClientDocument(clientId) : null;
  }
  return readClient(clientId);
}

async function jwksFor(uri: string, fresh = false): Promise<CryptoJwk[]> {
  const hit = jwksCache.get(uri);
  if (!fresh && hit && Date.now() - hit.at < REMOTE_TTL_MS) return hit.keys;
  const body = (await fetchJson(uri)) as { keys?: CryptoJwk[] } | null;
  const keys = Array.isArray(body?.keys) ? body.keys : [];
  if (keys.length) jwksCache.set(uri, { keys, at: Date.now() });
  return keys;
}

const JWT_BEARER = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

// private_key_jwt (RFC 7523): the client signs a short-lived JWT with its
// own key; we check it against the keys it publishes at jwks_uri.
export async function verifyClientAssertion(
  clientId: string,
  jwksUri: string,
  assertion: string | undefined,
  audiences: string[],
): Promise<boolean> {
  if (!assertion) return false;
  const parts = assertion.split(".");
  if (parts.length !== 3) return false;
  let header: { alg?: string; kid?: string };
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return false;
  }
  if (header.alg !== "RS256") return false;

  const pick = (keys: CryptoJwk[]) =>
    keys.find((k) => (k as { kid?: string }).kid === header.kid) ??
    (keys.length === 1 && !header.kid ? keys[0] : undefined);
  let jwk = pick(await jwksFor(jwksUri));
  if (!jwk) jwk = pick(await jwksFor(jwksUri, true)); // key rotation
  if (!jwk || jwk.kty !== "RSA") return false;

  let signatureOk = false;
  try {
    signatureOk = verifySignature(
      "RSA-SHA256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      createPublicKey({ key: jwk, format: "jwk" }),
      Buffer.from(parts[2], "base64url"),
    );
  } catch {
    return false;
  }
  if (!signatureOk) return false;

  const t = now();
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  return (
    claims.iss === clientId &&
    claims.sub === clientId &&
    aud.some((a) => typeof a === "string" && audiences.includes(a)) &&
    typeof claims.exp === "number" &&
    claims.exp > t - 60 &&
    (typeof claims.nbf !== "number" || claims.nbf <= t + 60)
  );
}

// --- Authorization request --------------------------------------------------

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scope: string;
  resource: string;
}

// Validates everything that doesn't depend on who is signing in. When this
// fails we must NOT redirect back to redirect_uri (it may be the problem),
// so callers show an error page instead.
export async function validateAuthorizeRequest(
  q: Record<string, string | undefined>,
): Promise<{ params: AuthorizeParams; appName: string } | { error: string }> {
  if (q.response_type !== "code")
    return { error: "Unsupported response_type (expected code)." };
  const client = await resolveClient(q.client_id);
  if (!client)
    return {
      error:
        "This app isn't registered with SpamToast. Remove the connector and add it again.",
    };
  const redirectUri = q.redirect_uri ?? "";
  if (
    !client.redirectUris.includes(redirectUri) ||
    !isAllowedRedirectUri(redirectUri)
  ) {
    return { error: "This sign-in link has an unknown return address." };
  }
  if (!q.code_challenge || q.code_challenge_method !== "S256") {
    return {
      error: "This app didn't send a secure (PKCE S256) sign-in request.",
    };
  }
  return {
    params: {
      clientId: q.client_id as string,
      redirectUri,
      state: q.state ?? "",
      codeChallenge: q.code_challenge,
      scope: q.scope ?? "mcp",
      resource: q.resource ?? "",
    },
    // From where the code will actually be sent, not the app's self-chosen
    // name, so nothing can present itself as "ChatGPT" on our sign-in page.
    appName: appNameForRedirect(redirectUri),
  };
}

export function verifyLoginPassword(attempt: string): boolean {
  const expected = process.env.MCP_LOGIN_PASSWORD;
  if (!expected) return false;
  const a = Buffer.from(attempt);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function login(email: string, password: string): McpUser | null {
  const passwordOk = verifyLoginPassword(password);
  const user = findMcpUserByEmail(email);
  return passwordOk && user ? user : null;
}

function clientRef(clientId: string): string {
  return createHash("sha256").update(clientId).digest("base64url").slice(0, 22);
}

export function issueAuthCode(params: AuthorizeParams, email: string): string {
  return signBlob("code", {
    c: clientRef(params.clientId),
    r: params.redirectUri,
    ch: params.codeChallenge,
    e: email.toLowerCase(),
    s: params.scope,
    exp: now() + AUTH_CODE_TTL_S,
  });
}

// --- Token endpoint -----------------------------------------------------------

export interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

type TokenResult =
  | { ok: true; body: TokenResponse }
  | { ok: false; error: string; description: string };

function issueTokens(
  email: string,
  clientId: string,
  scope: string,
): TokenResponse {
  return {
    access_token: signBlob("at", {
      e: email,
      c: clientRef(clientId),
      exp: now() + ACCESS_TOKEN_TTL_S,
    }),
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_S,
    refresh_token: signBlob("rt", {
      e: email,
      c: clientRef(clientId),
      s: scope,
      exp: now() + REFRESH_TOKEN_TTL_S,
    }),
    scope,
  };
}

export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function exchangeToken(
  form: Record<string, string | undefined>,
  opts: { origin?: string } = {},
): Promise<TokenResult> {
  const grant = form.grant_type;
  const clientId = form.client_id ?? "";
  const client = await resolveClient(clientId);
  if (!client) {
    return {
      ok: false,
      error: "invalid_client",
      description: "Unknown client_id",
    };
  }
  if (client.authMethod === "private_key_jwt") {
    const origin = opts.origin ?? "";
    const valid =
      form.client_assertion_type === JWT_BEARER &&
      (await verifyClientAssertion(
        clientId,
        client.jwksUri ?? "",
        form.client_assertion,
        [`${origin}/api/oauth/token`, origin].filter(Boolean),
      ));
    if (!valid) {
      return {
        ok: false,
        error: "invalid_client",
        description: "Client assertion missing or invalid",
      };
    }
  } else if (
    client.authMethod !== "none" &&
    !secretMatches(clientId, form.client_secret)
  ) {
    return {
      ok: false,
      error: "invalid_client",
      description: "Client secret missing or wrong",
    };
  }

  if (grant === "authorization_code") {
    const code = verifyBlob<{
      c: string;
      r: string;
      ch: string;
      e: string;
      s: string;
    }>("code", form.code);
    if (!code)
      return {
        ok: false,
        error: "invalid_grant",
        description: "Code is invalid or expired",
      };
    if (code.c !== clientRef(clientId))
      return {
        ok: false,
        error: "invalid_grant",
        description: "Code was issued to a different client",
      };
    if (code.r !== form.redirect_uri)
      return {
        ok: false,
        error: "invalid_grant",
        description: "redirect_uri mismatch",
      };
    if (!pkceMatches(form.code_verifier ?? "", code.ch))
      return {
        ok: false,
        error: "invalid_grant",
        description: "PKCE check failed",
      };
    if (!findMcpUserByEmail(code.e))
      return {
        ok: false,
        error: "invalid_grant",
        description: "No longer a team member",
      };
    return { ok: true, body: issueTokens(code.e, clientId, code.s || "mcp") };
  }

  if (grant === "refresh_token") {
    const rt = verifyBlob<{ e: string; c: string; s: string }>(
      "rt",
      form.refresh_token,
    );
    if (!rt)
      return {
        ok: false,
        error: "invalid_grant",
        description: "Refresh token is invalid or expired",
      };
    if (rt.c !== clientRef(clientId))
      return {
        ok: false,
        error: "invalid_grant",
        description: "Refresh token was issued to a different client",
      };
    if (!findMcpUserByEmail(rt.e))
      return {
        ok: false,
        error: "invalid_grant",
        description: "No longer a team member",
      };
    return { ok: true, body: issueTokens(rt.e, clientId, rt.s || "mcp") };
  }

  return {
    ok: false,
    error: "unsupported_grant_type",
    description: "Use authorization_code or refresh_token",
  };
}

// Access tokens carry only the email; the person's name and role are looked
// up again from MCP_ADMIN_USERS on every request.
export function userFromAccessToken(token: string): McpUser | null {
  const at = verifyBlob<{ e: string }>("at", token);
  if (!at) return null;
  return findMcpUserByEmail(at.e);
}

export function isOAuthAccessToken(token: string): boolean {
  return token.startsWith(`${PREFIX.at}.`);
}

// One entry point for both routes: a signed-in (OAuth) access token, or a
// personal token from MCP_ADMIN_USERS / the legacy shared token.
export function authenticateMcpBearer(token: string): McpUser | null {
  if (!token) return null;
  if (isOAuthAccessToken(token)) return userFromAccessToken(token);
  return authenticateMcpToken(token);
}

// --- Metadata -------------------------------------------------------------------

export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp"],
    resource_name: "SpamToast admin (team members only)",
  };
}

export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: [
      "none",
      "client_secret_basic",
      "client_secret_post",
      "private_key_jwt",
    ],
    token_endpoint_auth_signing_alg_values_supported: ["RS256"],
    scopes_supported: ["mcp"],
    // We send iss back on the sign-in redirect (RFC 9207) and accept
    // client metadata documents (ChatGPT's preferred registration) as
    // well as registration_endpoint - ChatGPT picks its flow from these.
    authorization_response_iss_parameter_supported: true,
    client_id_metadata_document_supported: true,
  };
}

export function wwwAuthenticateHeader(origin: string): string {
  return `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp"`;
}

// --- Sign-in attempt limit ----------------------------------------------------
// Best-effort and in-memory (resets on a cold start) - this stack has no
// shared store. Keyed by
// both IP and email so one address can't be hammered from many IPs within
// a warm instance either.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 8;
const failures = new Map<string, number[]>();

function recent(key: string): number[] {
  const t = Date.now();
  const list = (failures.get(key) ?? []).filter((x) => t - x < WINDOW_MS);
  failures.set(key, list);
  return list;
}

export function isLoginLocked(ip: string, email: string): boolean {
  return (
    recent(`ip:${ip}`).length >= MAX_FAILS ||
    recent(`email:${email.toLowerCase()}`).length >= MAX_FAILS
  );
}

export function recordLoginFailure(ip: string, email: string): void {
  const t = Date.now();
  recent(`ip:${ip}`).push(t);
  recent(`email:${email.toLowerCase()}`).push(t);
}

export function resetLoginFailuresForTests(): void {
  failures.clear();
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-nf-client-connection-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

// The address people actually use (https://spamtoast.com), not the one
// the function sees. On Netlify, req.url can be the internal deploy address
// (https://main--<site>.netlify.app), so metadata built from it
// advertised the wrong server and ChatGPT/Claude refused to connect: they
// require the resource in the metadata to match the URL they were given.
// Order: explicit MCP_PUBLIC_ORIGIN, then the forwarded/Host header, and if
// that is still a *.netlify.app address, Netlify's own main-site URL.
const HOST_RE = /^[a-z0-9.-]+(:\d+)?$/i;

export function publicOrigin(req: Request): string {
  const configured = process.env.MCP_PUBLIC_ORIGIN?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const reqUrl = new URL(req.url);
  const host = (
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    reqUrl.host
  )
    .split(",")[0]
    .trim();
  const proto = (
    req.headers.get("x-forwarded-proto") ?? reqUrl.protocol.replace(":", "")
  )
    .split(",")[0]
    .trim();
  const origin =
    HOST_RE.test(host) && (proto === "https" || proto === "http")
      ? `${proto}://${host}`
      : reqUrl.origin;

  const netlifyMain = process.env.URL?.trim();
  if (new URL(origin).hostname.endsWith(".netlify.app") && netlifyMain) {
    return netlifyMain.replace(/\/+$/, "");
  }
  return origin;
}

export const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers":
    "content-type, authorization, mcp-protocol-version",
};
