import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getScope, assertOrg } from "./lib/auth";

const statusValidator = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("completed"),
  v.literal("archived"),
);

export const list = query({
  args: { status: v.optional(statusValidator) },
  handler: async (ctx, { status }) => {
    const scope = await getScope(ctx);
    const rows = status
      ? await ctx.db
          .query("shoots")
          .withIndex("by_org_status", (q) =>
            q.eq("orgId", scope.orgId).eq("status", status),
          )
          .order("desc")
          .collect()
      : await ctx.db
          .query("shoots")
          .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
          .order("desc")
          .collect();

    // Attach light counts for the dashboard cards.
    return Promise.all(
      rows.map(async (shoot) => {
        const locs = await ctx.db
          .query("shootLocations")
          .withIndex("by_shoot", (q) => q.eq("shootId", shoot._id))
          .collect();
        const shots = await ctx.db
          .query("shots")
          .withIndex("by_shoot", (q) => q.eq("shootId", shoot._id))
          .collect();
        // Up to 5 most-recent finished photos for the card slideshow.
        const gens = await ctx.db
          .query("generations")
          .withIndex("by_shoot", (q) => q.eq("shootId", shoot._id))
          .order("desc")
          .collect();
        const recentImages: string[] = [];
        for (const g of gens) {
          if (g.status !== "succeeded") continue;
          let u = g.imageUrl;
          if (!u && g.storageId) {
            u = (await ctx.storage.getUrl(g.storageId)) ?? undefined;
          }
          if (u) recentImages.push(u);
          if (recentImages.length >= 5) break;
        }
        return {
          ...shoot,
          locationCount: locs.length,
          shotCount: shots.length,
          recentImages,
        };
      }),
    );
  },
});

export const get = query({
  args: { id: v.id("shoots") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    return assertOrg(await ctx.db.get(id), scope);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    scheduledAt: v.optional(v.number()),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scope = await getScope(ctx);
    return await ctx.db.insert("shoots", {
      orgId: scope.orgId,
      createdBy: scope.userId,
      status: "draft",
      ...args,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("shoots"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(statusValidator),
    scheduledAt: v.optional(v.number()),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...patch }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("shoots") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    // Cascade: shots, shootLocations, generations.
    const shots = await ctx.db
      .query("shots")
      .withIndex("by_shoot", (q) => q.eq("shootId", id))
      .collect();
    for (const s of shots) await ctx.db.delete(s._id);
    const locs = await ctx.db
      .query("shootLocations")
      .withIndex("by_shoot", (q) => q.eq("shootId", id))
      .collect();
    for (const l of locs) await ctx.db.delete(l._id);
    const gens = await ctx.db
      .query("generations")
      .withIndex("by_shoot", (q) => q.eq("shootId", id))
      .collect();
    for (const g of gens) await ctx.db.delete(g._id);
    await ctx.db.delete(id);
  },
});
