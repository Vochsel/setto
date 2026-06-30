/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728).
 *
 * Remote MCP clients (Claude.ai, ChatGPT) fetch this to discover which
 * authorization server to log in to before calling the MCP endpoint. We point
 * them at WorkOS AuthKit (via MCP_AUTHORIZATION_SERVER); they then read WorkOS's
 * own `/.well-known/oauth-authorization-server`, register, and run the flow.
 *
 * The optional catch-all segment makes this respond at both
 * `/.well-known/oauth-protected-resource` and the resource-suffixed form
 * `/.well-known/oauth-protected-resource/api/mcp` that some clients probe.
 */
import { protectedResourceMetadata, CORS_HEADERS } from "@/lib/mcp/auth";

export const runtime = "nodejs";

export function GET(req: Request): Response {
  return Response.json(protectedResourceMetadata(req), {
    headers: { "cache-control": "public, max-age=3600", ...CORS_HEADERS },
  });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
