import {
  CORS_HEADERS,
  exchangeToken,
  publicOrigin,
} from "@/lib/admin/mcp-oauth";

async function readForm(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    return Object.fromEntries(
      Object.entries(body ?? {}).map(([k, v]) => [k, String(v)]),
    );
  }
  const form = new URLSearchParams(await req.text());
  return Object.fromEntries(form.entries());
}

// Clients may send client_id (and client_secret, if they registered for
// one) as HTTP Basic credentials instead of form fields. Accept either,
// preferring the form fields.
function basicCredentials(req: Request): { id?: string; secret?: string } {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return {};
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const i = decoded.indexOf(":");
    const id = decodeURIComponent(i === -1 ? decoded : decoded.slice(0, i));
    const secret = i === -1 ? "" : decodeURIComponent(decoded.slice(i + 1));
    return { id: id || undefined, secret: secret || undefined };
  } catch {
    return {};
  }
}

// Exchanges a sign-in code (with its PKCE verifier) or a refresh token for
// a fresh access token.
export async function POST(req: Request): Promise<Response> {
  const form = await readForm(req);
  const basic = basicCredentials(req);
  if (!form.client_id && basic.id) form.client_id = basic.id;
  if (!form.client_secret && basic.secret) form.client_secret = basic.secret;
  const result = await exchangeToken(form, { origin: publicOrigin(req) });
  const headers = {
    ...CORS_HEADERS,
    "cache-control": "no-store",
    pragma: "no-cache",
  };
  if (!result.ok) {
    return Response.json(
      { error: result.error, error_description: result.description },
      { status: result.error === "invalid_client" ? 401 : 400, headers },
    );
  }
  return Response.json(result.body, { headers });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
