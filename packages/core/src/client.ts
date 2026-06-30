/**
 * The shared "tool" layer: an authenticated Convex client and a generic `call`
 * that routes any function path to query/mutation/action. Both the CLI and the
 * MCP server use this, so they expose exactly the same product surface.
 */
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { getConfig } from "./config";
import { ensureToken } from "./auth";
import { findFn, type FnType } from "./manifest";

export async function getClient(opts?: {
  interactive?: boolean;
}): Promise<ConvexHttpClient> {
  const token = await ensureToken(opts);
  const client = new ConvexHttpClient(getConfig().convexUrl);
  client.setAuth(token);
  return client;
}

/** Invoke a function on an existing client by path + type. */
export function callWith(
  client: ConvexHttpClient,
  path: string,
  type: FnType,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (type) {
    case "Query":
      return client.query(makeFunctionReference<"query">(path), args);
    case "Mutation":
      return client.mutation(makeFunctionReference<"mutation">(path), args);
    case "Action":
      return client.action(makeFunctionReference<"action">(path), args);
  }
}

/**
 * Call a function by path. The type is looked up from the manifest; pass
 * `type` to call a function not in the manifest (e.g. internal during dev).
 */
export async function call(
  path: string,
  args: Record<string, unknown> = {},
  opts?: { interactive?: boolean; type?: FnType },
): Promise<unknown> {
  const type = opts?.type ?? findFn(path)?.type;
  if (!type) throw new Error(`Unknown function: ${path}`);
  const client = await getClient(opts);
  return callWith(client, path, type, args);
}
