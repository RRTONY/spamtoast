import { authenticateMcpToken, isMcpAuthConfigured } from "@/lib/admin/mcp-auth";
import { jsonError, respondToMcp } from "@/lib/admin/mcp-handler";

export const dynamic = "force-dynamic";

// Token-in-path entry point, for MCP clients whose connector UI has no way to
// send an Authorization header. Same personal token from MCP_ADMIN_USERS;
// only its transport differs. URLs land in logs and browser history more
// easily than headers, so prefer /api/mcp for any client that supports it.
async function handle(req: Request, { params }: RouteContext<"/api/mcp/[token]">): Promise<Response> {
  if (!isMcpAuthConfigured()) {
    return jsonError(500, "MCP_ADMIN_USERS is not configured");
  }
  const { token } = await params;
  const user = authenticateMcpToken(token);
  if (!user) {
    return jsonError(401, "Unauthorized");
  }
  return respondToMcp(req, user);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
