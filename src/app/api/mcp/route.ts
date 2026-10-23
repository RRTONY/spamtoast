import { bearerFromRequest, isMcpAuthConfigured } from "@/lib/admin/mcp-auth";
import { jsonError, respondToMcp } from "@/lib/admin/mcp-handler";
import { authenticateMcpBearer, publicOrigin, wwwAuthenticateHeader } from "@/lib/admin/mcp-oauth";

export const dynamic = "force-dynamic";

// Header-auth entry point, for every client that can send an Authorization
// header: Claude.ai / Claude Desktop / ChatGPT after signing in on
// /oauth/authorize (an OAuth access token), or Claude Code with a personal
// token from MCP_ADMIN_USERS. The 401 carries a WWW-Authenticate pointer to
// our OAuth metadata: that is how Claude and ChatGPT discover they should
// open the sign-in page. Fails closed (500) when MCP_ADMIN_USERS isn't set,
// but only for this route — nothing else in the app depends on it.
async function handle(req: Request): Promise<Response> {
  if (!isMcpAuthConfigured()) {
    return jsonError(500, "MCP_ADMIN_USERS is not configured");
  }
  const user = authenticateMcpBearer(bearerFromRequest(req));
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "content-type": "application/json",
        "www-authenticate": wwwAuthenticateHeader(publicOrigin(req)),
      },
    });
  }
  return respondToMcp(req, user);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
