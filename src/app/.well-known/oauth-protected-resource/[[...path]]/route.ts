import {
  CORS_HEADERS,
  protectedResourceMetadata,
  publicOrigin,
} from "@/lib/admin/mcp-oauth";

// RFC 9728 protected-resource metadata for /api/mcp. Served at both
// /.well-known/oauth-protected-resource and .../api/mcp, since clients try
// the path-specific form first.
export function GET(req: Request): Response {
  return Response.json(protectedResourceMetadata(publicOrigin(req)), {
    headers: CORS_HEADERS,
  });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
