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
    "/((?!_next/static|_next/image|favicon.ico|callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
