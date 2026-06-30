import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getScope, assertOrg } from "./lib/auth";

/**
 * The persisted copywriter chat thread for a campaign (one row per campaign).
 * Messages are stored as the AI SDK `UIMessage[]` verbatim so they round-trip
 * through `useChat`. The streaming route (app/api/campaigns/[id]/copy-chat)
 * loads the thread each turn, appends the new message, streams, and saves the
 * full thread back via `save`.
 */

export const get = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, { campaignId }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(campaignId), scope);
    const row = await ctx.db
      .query("campaignCopyChats")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .unique();
    return row?.messages ?? [];
  },
});

export const save = mutation({
  args: {
    campaignId: v.id("campaigns"),
    // AI SDK UIMessage[] — stored opaquely.
    messages: v.array(v.any()),
  },
  handler: async (ctx, { campaignId, messages }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(campaignId), scope);
    const existing = await ctx.db
      .query("campaignCopyChats")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .unique();
    const patch = { messages, updatedAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id, patch);
    else
      await ctx.db.insert("campaignCopyChats", {
        orgId: scope.orgId,
        campaignId,
        ...patch,
      });
  },
});

export const clear = mutation({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, { campaignId }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(campaignId), scope);
    const existing = await ctx.db
      .query("campaignCopyChats")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});
