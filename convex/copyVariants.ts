import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getScope, assertOrg } from "./lib/auth";

/**
 * The campaign's growing, pinnable copy library. The copywriter chat appends
 * every option it proposes here (via `add`), and nothing is overwritten — so a
 * campaign accumulates many variations over time. The user can pin favorites,
 * apply one to the working copy (see `campaigns.setCopy`), or delete the rest.
 */

/** One copy option as proposed by the chat's `writeCopy` tool. */
const variantInput = v.object({
  headline: v.optional(v.string()),
  tagline: v.optional(v.string()),
  body: v.optional(v.string()),
  cta: v.optional(v.string()),
  personaName: v.optional(v.string()),
  angle: v.optional(v.string()),
  sources: v.optional(v.array(v.string())),
});

/** Pinned options first, then newest. */
export const list = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, { campaignId }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(campaignId), scope);
    const rows = await ctx.db
      .query("campaignCopyVariants")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .collect();
    return rows.sort((a, b) => {
      const pinned = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
      return pinned !== 0 ? pinned : b.createdAt - a.createdAt;
    });
  },
});

/** Append one or more proposed options to the library. Returns the new ids. */
export const add = mutation({
  args: {
    campaignId: v.id("campaigns"),
    variants: v.array(variantInput),
  },
  handler: async (ctx, { campaignId, variants }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(campaignId), scope);
    const now = Date.now();
    const ids = [];
    let i = 0;
    for (const variant of variants) {
      // Skip entirely-empty options so the model can't litter the library.
      if (!variant.headline && !variant.tagline && !variant.body && !variant.cta)
        continue;
      ids.push(
        await ctx.db.insert("campaignCopyVariants", {
          orgId: scope.orgId,
          createdBy: scope.userId,
          campaignId,
          ...variant,
          // Stagger timestamps so a batch keeps its proposed order.
          createdAt: now + i++,
        }),
      );
    }
    return ids;
  },
});

/** Pin / unpin a variant (pinned ones float to the top of the library). */
export const togglePin = mutation({
  args: { id: v.id("campaignCopyVariants") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    const row = assertOrg(await ctx.db.get(id), scope);
    await ctx.db.patch(id, { pinned: !row.pinned });
  },
});

export const remove = mutation({
  args: { id: v.id("campaignCopyVariants") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    await ctx.db.delete(id);
  },
});
