import { CORS_HEADERS, registerClient } from "@/lib/admin/mcp-oauth";

// RFC 7591 dynamic client registration - ChatGPT and Claude call this once
// when a connector is added. Only their real sign-in callbacks (or
// localhost apps) are accepted; see isAllowedRedirectUri.
export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const result = registerClient(body ?? {});
  if ("error" in result) {
    return Response.json(
      { error: "invalid_redirect_uri", error_description: result.error },
      { status: 400, headers: CORS_HEADERS },
    );
  }
  return Response.json(
    {
      client_id: result.clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: result.client.name || undefined,
      redirect_uris: result.client.redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: result.client.authMethod,
      ...(result.clientSecret
        ? { client_secret: result.clientSecret, client_secret_expires_at: 0 }
        : {}),
    },
    { status: 201, headers: CORS_HEADERS },
  );
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
