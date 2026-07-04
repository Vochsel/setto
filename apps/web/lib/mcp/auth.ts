/**
 * Auth for the remote MCP endpoint.
 *
 * Remote MCP clients (Claude.ai connectors, ChatGPT connectors) are OAuth
 * clients: they discover where to log in via the *protected resource metadata*
 * (RFC 9728) we serve at `/.well-known/oauth-protected-resource`, run the OAuth
 * flow against the authorization server it points to, then call this endpoint
 * with `Authorization: Bearer <access_token>`.
 *
 * We delegate the authorization server to **WorkOS AuthKit acting as an OAuth
 * 2.0 server** (the `{slug}.authkit.app/oauth2/*` endpoints). This is a distinct
 * authorization server from the AuthKit *SDK* the web app/CLI use: crucially, a
 * token minted by this flow carries `iss` = the AuthKit domain (e.g.
 * `https://your-app.authkit.app`), NOT `https://api.workos.com/user_management/…`.
 * The signing keys are shared, but the issuer string differs — so we must
 * validate against the AuthKit domain's own issuer + JWKS, and Convex needs a
 * matching provider (see `convex/auth.config.ts`) or every tool call 401s.
 *
 * This module:
 *   - validates the incoming bearer token against the AuthKit OAuth server's
 *     issuer + JWKS (both discovered from its RFC 8414 metadata), and
 *   - builds the protected-resource metadata + the `WWW-Authenticate` challenge.
 *
 * Required env (set on the deployed web app):
 *   MCP_AUTHORIZATION_SERVER    — your WorkOS AuthKit domain, e.g.
 *                                 https://your-app.authkit.app (the OAuth
 *                                 authorization server connectors log in to).
 *                                 Enable Dynamic Client Registration for it in
 *                                 the WorkOS dashboard so connectors self-register.
 *   MCP_RESOURCE_URL            — (optional) public URL of this MCP endpoint;
 *                                 defaults to <request origin>/api/mcp
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

/** The OAuth authorization server connectors log in to (WorkOS AuthKit domain). */
export function authorizationServer(): string | null {
  const as = process.env.MCP_AUTHORIZATION_SERVER;
  return as ? as.replace(/\/$/, "") : null;
}

/**
 * The authorization server's issuer identifier and JWKS URI, per its RFC 8414
 * metadata. For AuthKit the issuer equals the domain and the JWKS lives at
 * `/oauth2/jwks`, but we read them from the metadata so this stays correct for
 * any spec-compliant AS. Discovered once and cached for the lifetime of the
 * server instance; the JWKS itself is refetched/rotated by `jose`.
 */
let discovery: Promise<{ issuer: string; jwks_uri: string }> | null = null;
function getMetadata(as: string) {
  if (!discovery) {
    discovery = fetch(`${as}/.well-known/oauth-authorization-server`)
      .then((r) => {
        if (!r.ok) throw new Error(`AS metadata ${r.status}`);
        return r.json();
      })
      .then((m) => ({
        issuer: String(m.issuer ?? as),
        jwks_uri: String(m.jwks_uri ?? `${as}/oauth2/jwks`),
      }))
      .catch((e) => {
        discovery = null; // let the next request retry discovery
        throw e;
      });
  }
  return discovery;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksUri: string | null = null;
function getJwks(jwks_uri: string) {
  if (!jwks || jwksUri !== jwks_uri) {
    jwks = createRemoteJWKSet(new URL(jwks_uri));
    jwksUri = jwks_uri;
  }
  return jwks;
}

/**
 * Verify an AuthKit OAuth access token. Returns the JWT claims on success, or
 * null if the token is missing/expired/invalid or the AS isn't configured.
 * Convex re-validates the same token on every call, so this is a fast gate at
 * the edge rather than the sole authority.
 */
export async function verifyBearer(token: string): Promise<JWTPayload | null> {
  const as = authorizationServer();
  if (!as) return null; // no authorization server configured → fail closed
  try {
    const { issuer, jwks_uri } = await getMetadata(as);
    const { payload } = await jwtVerify(token, getJwks(jwks_uri), {
      // Pin the issuer to the AuthKit OAuth server. We don't pin the audience
      // here (WorkOS sets it to the requested `resource`); Convex enforces the
      // rest of the claim set on every call downstream.
      issuer,
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

/** RFC 9728 protected-resource metadata document. */
export function protectedResourceMetadata(req: Request) {
  const resource = resourceUrl(req);
  const as = authorizationServer();
  return {
    resource,
    authorization_servers: as ? [as] : [],
    bearer_methods_supported: ["header"],
    scopes_supported: ["openid", "profile", "email", "offline_access"],
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
