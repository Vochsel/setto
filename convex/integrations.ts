/**
 * Per-user connections to external services (Shopify / Printify / Buffer).
 *
 * This module holds the V8-runtime pieces: the public `list` query and
 * `disconnect` mutation the UI/MCP use, plus internal helpers the `"use node"`
 * actions in convex/integrationsNode.ts call to read/write the encrypted rows.
 *
 * The public surface NEVER returns the encrypted secret (ciphertext/iv/authTag)
 * — only the provider, a label, non-secret `meta`, and status. Connecting and
 * verifying (which need node:crypto + outbound fetch) live in integrationsNode.
 */
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { v } from "convex/values";
import { getScope } from "./lib/auth";

/** The external services a user can connect. */
export const PROVIDERS = ["shopify", "printify", "buffer"] as const;
export type Provider = (typeof PROVIDERS)[number];

/** A client-safe view of a connection — no secret material. */
function publicView(row: {
  provider: string;
  label?: string;
  meta?: unknown;
  status: string;
  lastError?: string;
  connectedAt: number;
  lastUsedAt?: number;
}) {
  return {
    provider: row.provider,
    label: row.label,
    meta: row.meta,
    status: row.status,
    lastError: row.lastError,
    connectedAt: row.connectedAt,
    lastUsedAt: row.lastUsedAt,
  };
}

/** The caller's own connections (secret material stripped). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const scope = await getScope(ctx);
    const rows = await ctx.db
      .query("integrations")
      .withIndex("by_org_user", (q) =>
        q.eq("orgId", scope.orgId).eq("userId", scope.userId),
      )
      .collect();
    return rows.map(publicView);
  },
});

/** Remove the caller's connection to a provider. */
export const disconnect = mutation({
  args: { provider: v.string() },
  handler: async (ctx, { provider }) => {
    const scope = await getScope(ctx);
    const row = await ctx.db
      .query("integrations")
      .withIndex("by_org_user_provider", (q) =>
        q
          .eq("orgId", scope.orgId)
          .eq("userId", scope.userId)
          .eq("provider", provider),
      )
      .unique();
    if (row) await ctx.db.delete(row._id);
    return { ok: true };
  },
});

// ── Internal helpers (called only by the "use node" actions) ────────────────

/** Fetch the full encrypted row for a user+provider. Internal use only. */
export const getRow = internalQuery({
  args: { orgId: v.string(), userId: v.string(), provider: v.string() },
  handler: async (ctx, { orgId, userId, provider }) => {
    return await ctx.db
      .query("integrations")
      .withIndex("by_org_user_provider", (q) =>
        q.eq("orgId", orgId).eq("userId", userId).eq("provider", provider),
      )
      .unique();
  },
});

/** Insert or replace the caller's encrypted connection for a provider. */
export const upsert = internalMutation({
  args: {
    provider: v.string(),
    label: v.optional(v.string()),
    meta: v.optional(v.any()),
    ciphertext: v.string(),
    iv: v.string(),
    authTag: v.string(),
    status: v.string(),
    connectedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const scope = await getScope(ctx);
    const existing = await ctx.db
      .query("integrations")
      .withIndex("by_org_user_provider", (q) =>
        q
          .eq("orgId", scope.orgId)
          .eq("userId", scope.userId)
          .eq("provider", args.provider),
      )
      .unique();
    const doc = {
      orgId: scope.orgId,
      userId: scope.userId,
      provider: args.provider,
      label: args.label,
      meta: args.meta,
      ciphertext: args.ciphertext,
      iv: args.iv,
      authTag: args.authTag,
      status: args.status,
      lastError: undefined,
      connectedAt: args.connectedAt,
    };
    if (existing) await ctx.db.patch(existing._id, doc);
    else await ctx.db.insert("integrations", doc);
  },
});

/** Update status/label/meta after a verify or an API call. */
export const setStatus = internalMutation({
  args: {
    orgId: v.string(),
    userId: v.string(),
    provider: v.string(),
    status: v.string(),
    lastError: v.optional(v.union(v.string(), v.null())),
    lastUsedAt: v.optional(v.number()),
    label: v.optional(v.string()),
    meta: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("integrations")
      .withIndex("by_org_user_provider", (q) =>
        q
          .eq("orgId", args.orgId)
          .eq("userId", args.userId)
          .eq("provider", args.provider),
      )
      .unique();
    if (!row) return;
    const patch: Record<string, unknown> = { status: args.status };
    if (args.lastError !== undefined)
      patch.lastError = args.lastError ?? undefined;
    if (args.lastUsedAt !== undefined) patch.lastUsedAt = args.lastUsedAt;
    if (args.label !== undefined) patch.label = args.label;
    if (args.meta !== undefined) patch.meta = args.meta;
    await ctx.db.patch(row._id, patch);
  },
});
