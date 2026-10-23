import {
  CORS_HEADERS,
  authorizationServerMetadata,
  publicOrigin,
} from "@/lib/admin/mcp-oauth";

// RFC 8414 authorization-server metadata: tells Claude/ChatGPT where the
// sign-in page, token and registration endpoints are.
export function GET(req: Request): Response {
  return Response.json(authorizationServerMetadata(publicOrigin(req)), {
    headers: CORS_HEADERS,
  });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
