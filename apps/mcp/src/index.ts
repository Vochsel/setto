/**
 * `setto-mcp` — a local (stdio) Model Context Protocol server exposing the same
 * product surface as the CLI, over the same shared @setto/core layer.
 *
 * The tool list and dispatch live in @setto/core (`tools.ts`) so this stdio
 * server and the remote HTTP server in the web app stay perfectly in sync. Auth
 * is shared with the CLI: it reads the credentials written by `setto login` (it
 * can't open a browser itself), so run that first.
 *
 * To connect Claude.ai or ChatGPT *online*, you want the remote server instead
 * — see apps/web/app/api/mcp and the README "Remote MCP" section.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import {
  call,
  getConfig,
  listTools,
  callTool,
  SERVER_NAME,
  SERVER_VERSION,
} from "@setto/core";

const server = new Server(
  { name: SERVER_NAME, version: SERVER_VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: listTools(),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name } = req.params;
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;
  try {
    // The stdio server runs as the user logged in via `setto login`; the
    // shared `call` re-auths from the stored credentials as needed.
    const result = await callTool(
      name,
      args,
      (path, callArgs) => call(path, callArgs, { interactive: false }),
      { webUrl: getConfig().webUrl },
    );
    return result as CallToolResult;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Not authenticated/.test(msg)) {
      return {
        content: [
          {
            type: "text" as const,
            text: `${msg}\nThe MCP server shares the CLI's credentials — run \`setto login\` in a terminal first.`,
          },
        ],
        isError: true,
      };
    }
    return {
      content: [{ type: "text" as const, text: `Error calling ${name}: ${msg}` }],
      isError: true,
    };
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
