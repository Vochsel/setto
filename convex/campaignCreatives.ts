import {
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import { v } from "convex/values";
import { getScope, assertOrg } from "./lib/auth";

/** All creatives for a campaign, newest first, with resolved URLs. */
export const listByCampaign = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, { campaignId }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(campaignId), scope);
    const rows = await ctx.db
      .query("campaignCreatives")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .order("desc")
      .collect();
    return Promise.all(
      rows.map(async (g) => {
        let imageUrl = g.imageUrl;
        if (!imageUrl && g.storageId) {
          imageUrl = (await ctx.storage.getUrl(g.storageId)) ?? undefined;
        }
        return { ...g, imageUrl };
      }),
    );
  },
});

export const create = internalMutation({
  args: {
    orgId: v.string(),
    createdBy: v.string(),
    campaignId: v.id("campaigns"),
    provider: v.string(),
    modelKey: v.string(),
    modelLabel: v.optional(v.string()),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("campaignCreatives", {
      ...args,
      status: "generating",
    });
  },
});

export const attachResult = internalMutation({
  args: {
    id: v.id("campaignCreatives"),
    status: v.union(v.literal("succeeded"), v.literal("failed")),
    imageUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    seed: v.optional(v.number()),
    falRequestId: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...patch }) => {
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("campaignCreatives") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    await ctx.db.delete(id);
  },
});
