/**
 * Persisted login for the CLI/MCP: the WorkOS access token, its expiry, and a
 * little user info. Stored at ~/.config/setto/credentials.json with 0600 perms.
 */
import { join } from "node:path";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { configDir } from "./config";

export interface Credentials {
  accessToken: string;
  /** Epoch ms when the access token expires. */
  expiresAt: number;
  user: { id: string; email?: string; name?: string };
}

function credPath(): string {
  return join(configDir(), "credentials.json");
}

export function loadCredentials(): Credentials | null {
  try {
    if (!existsSync(credPath())) return null;
    return JSON.parse(readFileSync(credPath(), "utf8")) as Credentials;
  } catch {
    return null;
  }
}

export function saveCredentials(creds: Credentials): void {
  const dir = configDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(credPath(), JSON.stringify(creds, null, 2) + "\n");
  try {
    chmodSync(credPath(), 0o600);
  } catch {
    /* best effort on non-POSIX */
  }
}

export function clearCredentials(): void {
  try {
    rmSync(credPath());
  } catch {
    /* already gone */
  }
}
