/**
 * Browser bridge for CLI / MCP login (the loopback OAuth dance).
 *
 * The `setto` CLI opens this page with ?port=<loopback>&state=<nonce>. WorkOS
 * AuthKit signs the user in (redirecting through the hosted login if needed),
 * then we 302 the resulting access token back to the CLI's localhost callback.
 * Only loopback (127.0.0.1) redirects are allowed.
 */
import { redirect } from "next/navigation";
import { withAuth } from "@workos-inc/authkit-nextjs";

export const dynamic = "force-dynamic";

function expiryMs(token: string): number {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    );
    if (typeof payload.exp === "number") return payload.exp * 1000;
  } catch {
    /* fall through to a conservative default */
  }
  return Date.now() + 10 * 60 * 1000;
}

export default async function CliLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ port?: string; state?: string }>;
}) {
  const { port, state } = await searchParams;

  const portNum = Number(port);
  const valid =
    Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535 && !!state;

  if (!valid) {
    return (
      <main className="grid min-h-screen place-items-center p-8 text-center">
        <div>
          <h1 className="text-lg font-semibold">Invalid login link</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Start the login from the CLI with <code>setto login</code>.
          </p>
        </div>
      </main>
    );
  }

  // Signs in (redirecting to WorkOS if needed), then returns the access token.
  const { user, accessToken } = await withAuth({ ensureSignedIn: true });

  const callback = new URL(`http://127.0.0.1:${portNum}/callback`);
  callback.searchParams.set("state", state!);
  callback.searchParams.set("access_token", accessToken);
  callback.searchParams.set("expires_at", String(expiryMs(accessToken)));
  callback.searchParams.set("sub", user.id);
  if (user.email) callback.searchParams.set("email", user.email);
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
  if (name) callback.searchParams.set("name", name);

  redirect(callback.toString());
}
