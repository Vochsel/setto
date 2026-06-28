import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

// Protect everything except the public marketing/auth entry points.
export default authkitMiddleware({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: ["/", "/login", "/signup"],
  },
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
