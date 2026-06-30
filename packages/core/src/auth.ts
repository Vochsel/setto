/**
 * Browser-redirect login for headless clients (CLI, MCP), shared by both.
 *
 * Flow (loopback OAuth, like `gh`/`vercel`):
 *   1. start a localhost server on a random port
 *   2. open the browser to <webUrl>/cli-login?port=PORT&state=STATE
 *   3. the web app authenticates the user (WorkOS AuthKit) and 302-redirects
 *      the access token back to http://127.0.0.1:PORT/callback
 *   4. we capture + persist it
 *
 * WorkOS access tokens are short-lived; rather than hold a refresh token in the
 * CLI we transparently re-run this flow when the token expires (the browser
 * session usually makes that instant).
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { getConfig } from "./config";
import {
  clearCredentials,
  loadCredentials,
  saveCredentials,
  type Credentials,
} from "./credentials";

function decodeJwtExpiry(token: string): number {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    );
    if (typeof payload.exp === "number") return payload.exp * 1000;
  } catch {
    /* fall through */
  }
  return Date.now() + 10 * 60 * 1000;
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd =
    platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    /* user can copy the URL from stderr */
  }
}

function donePage(message: string): string {
  return `<!doctype html><meta charset="utf-8"><title>setto</title><body style="font:15px system-ui;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h2>${message}</h2><p style="color:#666">You can close this tab.</p></div>`;
}

export interface LoginOptions {
  /** Override the web app URL used for the bridge. */
  webUrl?: string;
  /** Open the browser automatically (default true). */
  open?: boolean;
  /** Where to print the manual URL (default process.stderr). */
  log?: (msg: string) => void;
}

export function login(opts: LoginOptions = {}): Promise<Credentials> {
  const webUrl = (opts.webUrl ?? getConfig().webUrl).replace(/\/$/, "");
  const log = opts.log ?? ((m: string) => process.stderr.write(m + "\n"));
  const state = randomBytes(16).toString("hex");

  return new Promise<Credentials>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const qs = url.searchParams;
      if (qs.get("state") !== state) {
        res.writeHead(400).end("state mismatch");
        return;
      }
      const error = qs.get("error");
      if (error) {
        res
          .writeHead(400, { "content-type": "text/html" })
          .end(donePage("Login failed"));
        server.close();
        reject(new Error(error));
        return;
      }
      const accessToken = qs.get("access_token");
      if (!accessToken) {
        res.writeHead(400).end("missing access_token");
        return;
      }
      const creds: Credentials = {
        accessToken,
        expiresAt: Number(qs.get("expires_at")) || decodeJwtExpiry(accessToken),
        user: {
          id: qs.get("sub") ?? "",
          email: qs.get("email") ?? undefined,
          name: qs.get("name") ?? undefined,
        },
      };
      saveCredentials(creds);
      res
        .writeHead(200, { "content-type": "text/html" })
        .end(donePage("✓ Logged in to setto"));
      server.close();
      resolve(creds);
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const loginUrl = `${webUrl}/cli-login?port=${port}&state=${state}`;
      log(`\nOpening your browser to log in…`);
      log(`If it doesn't open, visit:\n  ${loginUrl}\n`);
      if (opts.open !== false) openBrowser(loginUrl);
    });

    setTimeout(
      () => {
        server.close();
        reject(new Error("Login timed out after 5 minutes"));
      },
      5 * 60 * 1000,
    );
  });
}

export function logout(): void {
  clearCredentials();
}

export function whoami(): Credentials["user"] | null {
  return loadCredentials()?.user ?? null;
}

/**
 * Return a valid access token, re-authenticating in the browser if the stored
 * one is missing/expired. Set `interactive: false` to throw instead (for
 * non-TTY contexts).
 */
export async function ensureToken(opts?: {
  interactive?: boolean;
}): Promise<string> {
  const creds = loadCredentials();
  if (creds && creds.expiresAt - 60_000 > Date.now()) return creds.accessToken;
  const interactive = opts?.interactive ?? process.stdout.isTTY === true;
  if (!interactive) {
    throw new Error("Not authenticated. Run `setto login` first.");
  }
  const fresh = await login();
  return fresh.accessToken;
}
