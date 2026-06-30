import { signOut } from "@workos-inc/authkit-nextjs";

export async function GET() {
  // Clears the session cookie and redirects to the configured logout URI.
  await signOut();
}
