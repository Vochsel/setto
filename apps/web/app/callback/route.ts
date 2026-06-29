import { handleAuth } from "@workos-inc/authkit-nextjs";

// WorkOS redirects here after sign-in; this exchanges the code and sets the
// session cookie, then sends the user to the dashboard.
export const GET = handleAuth({ returnPathname: "/dashboard" });
