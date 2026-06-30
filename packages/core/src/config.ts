/**
 * Resolves where the CLI/MCP talk to: the Convex deployment URL and the web
 * app URL (for the browser login bridge). Precedence: env > config file >
 * defaults. Config lives at ~/.config/setto/config.json (override the whole dir
 * with SETTO_CONFIG_DIR).
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

// setto production deployment (override with SETTO_CONVEX_URL for dev/staging).
const DEFAULT_CONVEX_URL = "https://formal-warthog-79.convex.cloud";
const DEFAULT_WEB_URL = "http://localhost:3000";

export interface SettoConfig {
  convexUrl: string;
  webUrl: string;
}

export function configDir(): string {
  return process.env.SETTO_CONFIG_DIR ?? join(homedir(), ".config", "setto");
}

function configFile(): string {
  return join(configDir(), "config.json");
}

function readFileConfig(): Partial<SettoConfig> {
  try {
    if (!existsSync(configFile())) return {};
    return JSON.parse(readFileSync(configFile(), "utf8"));
  } catch {
    return {};
  }
}

export function getConfig(): SettoConfig {
  const f = readFileConfig();
  return {
    convexUrl:
      process.env.SETTO_CONVEX_URL ??
      f.convexUrl ??
      process.env.NEXT_PUBLIC_CONVEX_URL ??
      DEFAULT_CONVEX_URL,
    webUrl: process.env.SETTO_WEB_URL ?? f.webUrl ?? DEFAULT_WEB_URL,
  };
}

export function setConfig(patch: Partial<SettoConfig>): SettoConfig {
  const dir = configDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const next = { ...readFileConfig(), ...patch };
  writeFileSync(configFile(), JSON.stringify(next, null, 2) + "\n");
  return getConfig();
}
