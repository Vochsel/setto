/**
 * Remote MCP server (Streamable HTTP) — connect Claude.ai and ChatGPT online.
 *
 * This is the hosted counterpart to the local stdio server in `apps/mcp`: same
 * tool surface (from @setto/core), but reachable over HTTPS and authenticated
 * per-request with an OAuth bearer token instead of local CLI credentials.
 *
 * Transport: a stateless implementation of MCP's Streamable HTTP transport —
 * each JSON-RPC request is handled in a single POST that returns a JSON
 * response. We don't keep server-side sessions, which is what makes this work
 * cleanly on serverless. `GET` (the optional server-to-client SSE stream) isn't
 * needed in stateless mode, so it returns 405.
 *
 * Auth: every request must carry `Authorization: Bearer <WorkOS access token>`.
 * We validate it (see lib/mcp/auth) and use it as the Convex caller, so all
 * org-scoping and permissions are exactly the same as the web app and CLI.
 *
 * Connect from:
 *   - Claude.ai → Settings → Connectors → Add custom connector → this URL
 *   - ChatGPT  → Settings → Connectors (Developer mode) / Deep Research → this URL
 */
import { ConvexHttpClient } from "convex/browser";
import {
  findFn,
  callWith,
  listTools,
  callTool,
  SERVER_NAME,
  SERVER_VERSION,
  getConfig,
  type Caller,
} from "@setto/core";
import {
  bearerFromRequest,
  verifyBearer,
  unauthorized,
  CORS_HEADERS,
} from "@/lib/mcp/auth";

// The shared tool layer pulls in node: builtins via @setto/core; force Node.
export const runtime = "nodejs";

const SUPPORTED_PROTOCOL = "2025-06-18";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Json;
}

function ok(id: JsonRpcRequest["id"], result: Json): Json {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(
  id: JsonRpcRequest["id"],
  code: number,
  message: string,
): Json {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

/** Build a Convex caller that acts as the bearer-token's user. */
function convexCaller(token: string): Caller {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  const client = new ConvexHttpClient(url);
  client.setAuth(token);
  return (path, args) => {
    const fn = findFn(path);
    if (!fn) throw new Error(`Unknown function: ${path}`);
    return callWith(client, path, fn.type, args);
  };
}

/** Handle one JSON-RPC message. Returns the response, or null for notifications. */
async function handleMessage(
  msg: JsonRpcRequest,
  caller: Caller,
  webUrl: string,
): Promise<Json | null> {
  const { method, id, params } = msg;

  // Notifications (no id) get no response.
  const isNotification = id === undefined || id === null;

  switch (method) {
    case "initialize":
      return ok(id, {
        protocolVersion:
          typeof params?.protocolVersion === "string"
            ? params.protocolVersion
            : SUPPORTED_PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      });

    case "ping":
      return ok(id, {});

    case "tools/list":
      return ok(id, { tools: listTools() });

    case "tools/call": {
      const name = String(params?.name ?? "");
      const args = (params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const result = await callTool(name, args, caller, { webUrl });
        return ok(id, result);
      } catch (e) {
        const text = `Error calling ${name}: ${e instanceof Error ? e.message : String(e)}`;
        // Tool errors are reported in-band (isError) per the MCP spec, not as
        // protocol errors, so the model sees and can react to them.
        return ok(id, { content: [{ type: "text", text }], isError: true });
      }
    }

    default:
      if (isNotification) return null; // ignore unknown notifications
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

export async function POST(req: Request): Promise<Response> {
  const token = bearerFromRequest(req);
  if (!token || !(await verifyBearer(token))) return unauthorized(req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(rpcError(null, -32700, "Parse error"), {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  const caller = convexCaller(token);
  const webUrl = getConfig().webUrl;
  const messages: JsonRpcRequest[] = Array.isArray(body)
    ? (body as JsonRpcRequest[])
    : [body as JsonRpcRequest];

  const responses: Json[] = [];
  for (const msg of messages) {
    const res = await handleMessage(msg, caller, webUrl);
    if (res !== null) responses.push(res);
  }

  // A batch/notification-only POST produces no responses → 202 Accepted.
  if (responses.length === 0) {
    return new Response(null, { status: 202, headers: CORS_HEADERS });
  }

  const payload = Array.isArray(body) ? responses : responses[0];
  return Response.json(payload, { headers: CORS_HEADERS });
}

export function GET(): Response {
  // Stateless server: no server-initiated SSE stream.
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { allow: "POST, OPTIONS", ...CORS_HEADERS },
  });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
