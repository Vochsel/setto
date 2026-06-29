import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

export async function GET() {
  // Use next/navigation redirect so the PKCE cookie set by getSignInUrl()
  // (via next/headers) is flushed onto the redirect response.
  redirect(await getSignInUrl());
}
