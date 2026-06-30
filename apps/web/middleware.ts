import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

// Protect everything except the public marketing/auth entry points.
export default authkitMiddleware({
  middlewareAuth: {
    enabled: true,
    // `/api/media-proxy` is hit by the ad-composer's sandboxed (opaque-origin)
    // iframe, which carries no auth cookies — it must be public. Its own host
    // allowlist is the safeguard.
    unauthenticatedPaths: ["/", "/login", "/signup", "/api/media-proxy"],
  },
});

export const config = {
  matcher: [
    // The remote MCP endpoint and its OAuth discovery metadata authenticate
    // themselves (bearer token / public metadata), so AuthKit must not run on
    // them — otherwise unauthenticated connector requests get HTML login
    // redirects instead of a proper 401 / JSON.
    "/((?!_next/static|_next/image|favicon.ico|callback|api/mcp|\\.well-known|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
