/**
 * The agent's client for the setto backend.
 *
 * Every call carries the shared secret and the sender's principal — a Telegram
 * chat id, or a phone number on iMessage. Convex (`convex/agent.ts`) resolves
 * that to a workspace and refuses anything it doesn't recognise, so the
 * principal is not a convenience: it IS the authorization, and it must come
 * from the verified webhook rather than from anything the model composed.
 */
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. The iMessage agent can't reach setto without it.`,
    );
  }
  return value;
}

let client: ConvexHttpClient | null = null;
function convex(): ConvexHttpClient {
  if (!client) {
    client = new ConvexHttpClient(required("NEXT_PUBLIC_CONVEX_URL"));
  }
  return client;
}

/**
 * The messaging principal for the current session, set by the channel.
 *
 * Structural rather than imported from eve so it works for both a tool's
 * `ToolContext` and a channel's `SessionContext` — both carry the same
 * initiator, and both may legitimately have none (a scheduled task, say), which
 * is a refusal rather than a default.
 */
export function principalFrom(ctx: {
  session?: {
    auth?: { initiator?: { principalId?: string } | null } | null;
  } | null;
}): string {
  const principal = ctx.session?.auth?.initiator?.principalId;
  if (!principal) {
    throw new Error("No messaging principal on this session — refusing to act.");
  }
  return principal;
}

type Args = Record<string, unknown>;

const withAuth = (principal: string, args: Args): Args => ({
  ...args,
  principal,
  secret: required("AGENT_SHARED_SECRET"),
});

export const setto = {
  products: (principal: string, args: Args = {}) =>
    convex().query(anyApi.agent.products, withAuth(principal, args)),
  cast: (principal: string) =>
    convex().query(anyApi.agent.cast, withAuth(principal, {})),
  gallery: (principal: string, args: Args = {}) =>
    convex().query(anyApi.agent.gallery, withAuth(principal, args)),
  flows: (principal: string) =>
    convex().query(anyApi.agent.flows, withAuth(principal, {})),
  generate: (principal: string, args: Args) =>
    convex().action(anyApi.agent.generate, withAuth(principal, args)),
  review: (principal: string, args: Args) =>
    convex().action(anyApi.agent.review, withAuth(principal, args)),
  syncShopify: (principal: string, args: Args = {}) =>
    convex().action(anyApi.agent.syncShopify, withAuth(principal, args)),
};
