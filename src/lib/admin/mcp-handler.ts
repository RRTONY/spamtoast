import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { McpUser } from "@/lib/admin/mcp-auth";
import { createAdminMcpServer } from "@/lib/admin/mcp-server";
import { publicOrigin } from "@/lib/admin/mcp-oauth";

export function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Stateless: a fresh Server + transport per request. Every tool call this
// server exposes resolves its own state from GitHub (see
// mcp-tool-context.ts) rather than anything held in memory between
// requests, which matches Netlify Functions' actual guarantee of none.
// Callers must authenticate the request themselves before calling this — it
// does no auth of its own.
export async function respondToMcp(
  req: Request,
  user: McpUser,
): Promise<Response> {
  // Stateless means no standalone server-to-client stream (GET) and no
  // sessions to end (DELETE). Without this, GET opened an event stream that
  // never sent anything and never closed, so clients that probe it during
  // setup (ChatGPT's "Create MCP app") hung until they gave up. 405 is the
  // spec's answer for "this server doesn't offer that stream"; clients then
  // just use POST.
  if (req.method === "GET" || req.method === "DELETE") {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed: use POST" },
        id: null,
      }),
      {
        status: 405,
        headers: { "content-type": "application/json", allow: "POST" },
      },
    );
  }
  const server = createAdminMcpServer(user, publicOrigin(req));
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}
