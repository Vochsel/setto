/**
 * The transport-agnostic MCP tool layer.
 *
 * Both MCP servers — the local stdio server (`apps/mcp`) and the remote HTTP
 * server mounted in the web app (`apps/web/app/api/mcp`) — build their tool
 * list and dispatch tool calls from here, so they expose *exactly* the same
 * surface. The only thing that differs between them is auth: each passes in its
 * own `Caller`, which knows how to invoke a Convex function as the right user
 * (file credentials for the CLI/stdio; a per-request bearer token for HTTP).
 *
 * On top of the generic `describe`/`call` pair and one typed tool per public
 * Convex function, we also expose `search` + `fetch` — the two tools ChatGPT
 * Deep Research expects — implemented generically over the product surface.
 */
import {
  manifest,
  signature,
  byDomain,
  domains,
  findFn,
  type FnSpec,
} from "./manifest";
import { argsJsonSchema } from "./jsonschema";

export const SERVER_NAME = "setto";
export const SERVER_VERSION = "0.1.0";

/** MCP tool names can't contain ":", so we map "campaigns:list" <-> "campaigns__list". */
const SEP = "__";
export const toToolName = (path: string): string => path.replace(":", SEP);
export const toPath = (name: string): string => name.replace(SEP, ":");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Json;
}

/** Runs a Convex function by path as the authenticated caller. */
export type Caller = (
  path: string,
  args: Record<string, unknown>,
) => Promise<unknown>;

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Json;
  isError?: boolean;
}

const GENERAL_TOOLS: McpTool[] = [
  {
    name: "describe",
    description:
      "List the setto product surface (every function, its type and argument schema). Optional { domain } filter, e.g. 'campaigns'.",
    inputSchema: {
      type: "object",
      properties: { domain: { type: "string", description: "e.g. campaigns" } },
    },
  },
  {
    name: "call",
    description:
      "Call any setto function by path, e.g. { path: 'campaigns:list', args: {} }. Use `describe` to find paths and argument shapes.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "function path, e.g. campaigns:list",
        },
        args: { type: "object", description: "arguments object" },
      },
      required: ["path"],
    },
  },
  {
    name: "search",
    description:
      "Search across your setto data (shoots, models, outfits, locations, campaigns, presets, …). Returns a list of matching records as { id, title, url }; pass an id to `fetch` for the full record. Designed for ChatGPT Deep Research.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "free-text search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "fetch",
    description:
      "Fetch a single setto record by the id returned from `search` (e.g. 'shoots:<id>'). Returns { id, title, text, url, metadata }. Designed for ChatGPT Deep Research.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "record id from `search`" },
      },
      required: ["id"],
    },
  },
];

/** The full MCP tool list: general tools + one typed tool per Convex function. */
export function listTools(): McpTool[] {
  return [
    ...GENERAL_TOOLS,
    ...manifest.map((fn) => ({
      name: toToolName(fn.path),
      description: `${fn.type} — ${signature(fn)}`,
      inputSchema: argsJsonSchema(fn.args),
    })),
  ];
}

function text(data: unknown): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

/** ── Deep Research search/fetch, generically over the manifest ──────────────
 *
 * A domain is searchable when it has a no-required-arg `list` and a `get` that
 * takes an `id`. We list each such domain, substring-match the query against the
 * record JSON, and return `{ id: "<domain>:<_id>", title, url }`. `fetch` walks
 * that back to `<domain>:get { id }`.
 */
function listFn(domain: string): FnSpec | undefined {
  return byDomain(domain).find((f) => f.path === `${domain}:list`);
}

function hasNoRequiredArgs(fn: FnSpec): boolean {
  const v = fn.args;
  if (!v || v.type !== "object") return true;
  return Object.values(v.value ?? {}).every(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (f) => (f as any)?.optional === true,
  );
}

function getFnTakesId(domain: string): boolean {
  const fn = findFn(`${domain}:get`);
  if (!fn || fn.args?.type !== "object") return false;
  return Boolean(fn.args.value?.id);
}

/** Domains that support generic search + fetch. */
export function searchableDomains(): string[] {
  return domains().filter((d) => {
    const list = listFn(d);
    return Boolean(list) && hasNoRequiredArgs(list as FnSpec) && getFnTakesId(d);
  });
}

function titleOf(domain: string, doc: Record<string, unknown>): string {
  for (const key of ["name", "title", "label", "headline"]) {
    const val = doc[key];
    if (typeof val === "string" && val.trim()) return val;
  }
  return `${domain} ${String(doc._id ?? "")}`.trim();
}

function recordUrl(
  webUrl: string | undefined,
  domain: string,
  id: string,
): string | undefined {
  if (!webUrl) return undefined;
  return `${webUrl.replace(/\/$/, "")}/${domain}/${id}`;
}

async function runSearch(
  query: string,
  caller: Caller,
  webUrl?: string,
): Promise<ToolResult> {
  const needle = query.trim().toLowerCase();
  const results: Array<{ id: string; title: string; url?: string }> = [];
  for (const domain of searchableDomains()) {
    let rows: unknown;
    try {
      rows = await caller(`${domain}:list`, {});
    } catch {
      continue; // domain not listable as this user; skip
    }
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const doc = row as Record<string, unknown>;
      const id = String(doc._id ?? "");
      if (!id) continue;
      const matches =
        !needle || JSON.stringify(doc).toLowerCase().includes(needle);
      if (!matches) continue;
      results.push({
        id: `${domain}:${id}`,
        title: titleOf(domain, doc),
        url: recordUrl(webUrl, domain, id),
      });
    }
  }
  const payload = { results };
  return { ...text(payload), structuredContent: payload };
}

async function runFetch(
  recordId: string,
  caller: Caller,
  webUrl?: string,
): Promise<ToolResult> {
  const sep = recordId.indexOf(":");
  if (sep < 0) throw new Error(`Invalid id (expected "<domain>:<id>"): ${recordId}`);
  const domain = recordId.slice(0, sep);
  const id = recordId.slice(sep + 1);
  if (!getFnTakesId(domain))
    throw new Error(`Domain "${domain}" does not support fetch.`);
  const doc = (await caller(`${domain}:get`, { id })) as Record<
    string,
    unknown
  > | null;
  if (!doc) throw new Error(`Not found: ${recordId}`);
  const payload = {
    id: recordId,
    title: titleOf(domain, doc),
    text: JSON.stringify(doc, null, 2),
    url: recordUrl(webUrl, domain, id),
    metadata: { domain },
  };
  return { ...text(payload), structuredContent: payload };
}

/**
 * Dispatch an MCP tool call. `caller` runs Convex functions as the
 * authenticated user; `webUrl` (optional) is used to build record links for
 * search/fetch results.
 */
export async function callTool(
  name: string,
  args: Record<string, unknown>,
  caller: Caller,
  opts: { webUrl?: string } = {},
): Promise<ToolResult> {
  if (name === "describe") {
    const domain = typeof args.domain === "string" ? args.domain : undefined;
    return text(
      domain ? byDomain(domain) : { domains: domains(), functions: manifest },
    );
  }
  if (name === "call") {
    const path = String(args.path ?? "");
    const callArgs = (args.args ?? {}) as Record<string, unknown>;
    return text(await caller(path, callArgs));
  }
  if (name === "search") {
    return runSearch(String(args.query ?? ""), caller, opts.webUrl);
  }
  if (name === "fetch") {
    return runFetch(String(args.id ?? ""), caller, opts.webUrl);
  }
  const path = toPath(name);
  if (!findFn(path)) throw new Error(`Unknown tool: ${name}`);
  return text(await caller(path, args));
}
