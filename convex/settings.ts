import { mutation, query, type MutationCtx } from "./_generated/server";
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

/** Upsert the workspace settings row and patch it. */
async function patchSettings(
  ctx: MutationCtx,
  orgId: string,
  patch: Record<string, unknown>,
) {
  const existing = await ctx.db
    .query("settings")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .unique();
  if (existing) await ctx.db.patch(existing._id, patch);
  else await ctx.db.insert("settings", { orgId, ...patch });
}

/** Remember the workspace's preferred image-generation model. */
export const setDefaultImageModel = mutation({
  args: { modelKey: v.string() },
  handler: async (ctx, { modelKey }) => {
    const scope = await getScope(ctx);
    await patchSettings(ctx, scope.orgId, { defaultImageModelKey: modelKey });
  },
});

/** Timezone used when scheduling social posts (IANA, e.g. Australia/Sydney). */
export const setTimezone = mutation({
  args: { timezone: v.string() },
  handler: async (ctx, { timezone }) => {
    const scope = await getScope(ctx);
    await patchSettings(ctx, scope.orgId, { timezone });
  },
});
