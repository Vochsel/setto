/**
 * `setto-mcp` — a Model Context Protocol server exposing the same product
 * surface as the CLI, over the same shared @setto/core auth + call layer.
 *
 * It registers two general tools (`describe`, `call`) plus one typed tool per
 * public Convex function. Auth is shared with the CLI: it reads the credentials
 * written by `setto login` (it can't open a browser itself), so run that first.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  manifest,
  byDomain,
  domains,
  findFn,
  signature,
  call,
  getConfig,
} from "@setto/core";
import { argsJsonSchema } from "./jsonschema";

const SEP = "__";
const toToolName = (path: string) => path.replace(":", SEP);
const toPath = (name: string) => name.replace(SEP, ":");

const server = new Server(
  { name: "setto", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

const GENERAL_TOOLS = [
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
        path: { type: "string", description: "function path, e.g. campaigns:list" },
        args: { type: "object", description: "arguments object" },
      },
      required: ["path"],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    ...GENERAL_TOOLS,
    ...manifest.map((fn) => ({
      name: toToolName(fn.path),
      description: `${fn.type} — ${signature(fn)}`,
      inputSchema: argsJsonSchema(fn.args),
    })),
  ],
}));

function text(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorText(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name } = req.params;
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;
  try {
    if (name === "describe") {
      const domain = typeof args.domain === "string" ? args.domain : undefined;
      return text(
        domain ? byDomain(domain) : { domains: domains(), functions: manifest },
      );
    }
    if (name === "call") {
      const path = String(args.path ?? "");
      const callArgs = (args.args ?? {}) as Record<string, unknown>;
      return text(await call(path, callArgs, { interactive: false }));
    }
    const path = toPath(name);
    if (!findFn(path)) return errorText(`Unknown tool: ${name}`);
    return text(await call(path, args, { interactive: false }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Not authenticated/.test(msg)) {
      return errorText(
        `${msg}\nThe MCP server shares the CLI's credentials — run \`setto login\` in a terminal first.`,
      );
    }
    return errorText(`Error calling ${name}: ${msg}`);
  }
});

async function main() {
  await server.connect(new StdioServerTransport());
  process.stderr.write(
    `setto MCP server ready (convex: ${getConfig().convexUrl})\n`,
  );
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
