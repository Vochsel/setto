/**
 * Auth for the remote MCP endpoint.
 *
 * Remote MCP clients (Claude.ai connectors, ChatGPT connectors) are OAuth
 * clients: they discover where to log in via the *protected resource metadata*
 * (RFC 9728) we serve at `/.well-known/oauth-protected-resource`, run the OAuth
 * flow against the authorization server it points to, then call this endpoint
 * with `Authorization: Bearer <access_token>`.
 *
 * We delegate the authorization server to **WorkOS AuthKit** (the same IdP the
 * web app already uses), so users sign in with the same accounts/orgs and no new
 * user store is needed. This module:
 *   - validates the incoming bearer token against WorkOS's JWKS (mirroring
 *     `convex/auth.config.ts`, which is the real enforcement point), and
 *   - builds the protected-resource metadata + the `WWW-Authenticate` challenge.
 *
 * Required env (set on the deployed web app):
 *   WORKOS_CLIENT_ID            — your WorkOS application client id
 *   WORKOS_JWT_CLIENT_ID        — (optional) the env client id WorkOS puts in
 *                                 the token `iss`; defaults to WORKOS_CLIENT_ID
 *   MCP_AUTHORIZATION_SERVER    — your WorkOS AuthKit domain, e.g.
 *                                 https://your-app.authkit.app (the OAuth
 *                                 authorization server connectors log in to)
 *   MCP_RESOURCE_URL            — (optional) public URL of this MCP endpoint;
 *                                 defaults to <request origin>/api/mcp
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

function jwtClientId(): string {
  const id = process.env.WORKOS_JWT_CLIENT_ID ?? process.env.WORKOS_CLIENT_ID;
  if (!id)
    throw new Error("WORKOS_CLIENT_ID (or WORKOS_JWT_CLIENT_ID) is not set");
  return id;
}

// WorkOS publishes a JWKS per environment client id. Cache the remote set.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`https://api.workos.com/sso/jwks/${jwtClientId()}`),
    );
  }
  return jwks;
}

/**
 * Verify a WorkOS access token. Returns the JWT claims on success, or null if
 * the token is missing/expired/invalid. Convex re-validates the same token on
 * every call, so this is a fast gate rather than the sole authority.
 */
export async function verifyBearer(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      // WorkOS user-management tokens are issued under this prefix; we don't pin
      // the audience here because Convex enforces it downstream.
      issuer: `https://api.workos.com/user_management/${jwtClientId()}`,
    });
    return payload;
  } catch {
    return null;
  }
}

/** Pull a bearer token out of the Authorization header, if present. */
export function bearerFromRequest(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}

/** Public URL of this MCP resource (used as the OAuth `resource` identifier). */
export function resourceUrl(req: Request): string {
  if (process.env.MCP_RESOURCE_URL) return process.env.MCP_RESOURCE_URL;
  const origin = new URL(req.url).origin;
  return `${origin}/api/mcp`;
}

/** The OAuth authorization server connectors should log in to (WorkOS AuthKit). */
export function authorizationServer(): string | null {
  return process.env.MCP_AUTHORIZATION_SERVER ?? null;
}

/** RFC 9728 protected-resource metadata document. */
export function protectedResourceMetadata(req: Request) {
  const resource = resourceUrl(req);
  const as = authorizationServer();
  return {
    resource,
    authorization_servers: as ? [as] : [],
    bearer_methods_supported: ["header"],
    scopes_supported: ["openid", "profile", "email"],
  };
}

/**
 * Build a 401 with the `WWW-Authenticate` challenge that points OAuth clients at
 * our protected-resource metadata so they can discover the authorization server.
 */
export function unauthorized(req: Request): Response {
  const origin = new URL(req.url).origin;
  const metadataUrl = `${origin}/.well-known/oauth-protected-resource`;
  return new Response(
    JSON.stringify({ error: "invalid_token", error_description: "Missing or invalid bearer token" }),
    {
      status: 401,
      headers: {
        "content-type": "application/json",
        "www-authenticate": `Bearer resource_metadata="${metadataUrl}"`,
        ...CORS_HEADERS,
      },
    },
  );
}

export const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-session-id, mcp-protocol-version",
  "access-control-expose-headers": "mcp-session-id, www-authenticate",
};
