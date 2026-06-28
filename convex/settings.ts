import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getScope } from "./lib/auth";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const scope = await getScope(ctx);
    return await ctx.db
      .query("settings")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .unique();
  },
});

/** Remember the workspace's preferred image-generation model. */
export const setDefaultImageModel = mutation({
  args: { modelKey: v.string() },
  handler: async (ctx, { modelKey }) => {
    const scope = await getScope(ctx);
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { defaultImageModelKey: modelKey });
    } else {
      await ctx.db.insert("settings", {
        orgId: scope.orgId,
        defaultImageModelKey: modelKey,
      });
    }
  },
});
