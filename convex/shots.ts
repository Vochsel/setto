import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getScope, assertOrg } from "./lib/auth";

/** All shots in a shoot, each with its generations. Client groups by location. */
export const listByShoot = query({
  args: { shootId: v.id("shoots") },
  handler: async (ctx, { shootId }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(shootId), scope);
    const shots = await ctx.db
      .query("shots")
      .withIndex("by_shoot", (q) => q.eq("shootId", shootId))
      .collect();
    shots.sort((a, b) => a.order - b.order);

    return Promise.all(
      shots.map(async (shot) => {
        const generations = await ctx.db
          .query("generations")
          .withIndex("by_shot", (q) => q.eq("shotId", shot._id))
          .order("desc")
          .collect();
        const resolvedGens = await Promise.all(
          generations.map(async (g) => {
            let imageUrl = g.imageUrl;
            if (!imageUrl && g.storageId) {
              imageUrl = (await ctx.storage.getUrl(g.storageId)) ?? undefined;
            }
            // Attach this image's videos (newest first) so the card can show
            // them inline and live-update their render progress.
            const videos = await ctx.db
              .query("videos")
              .withIndex("by_generation", (q) => q.eq("generationId", g._id))
              .order("desc")
              .collect();
            return { ...g, imageUrl, videos };
          }),
        );
        return { ...shot, generations: resolvedGens };
      }),
    );
  },
});

export const create = mutation({
  args: {
    shootLocationId: v.id("shootLocations"),
    name: v.optional(v.string()),
    modelId: v.optional(v.id("models")),
  },
  handler: async (ctx, args) => {
    const scope = await getScope(ctx);
    const sl = assertOrg(await ctx.db.get(args.shootLocationId), scope);
    const existing = await ctx.db
      .query("shots")
      .withIndex("by_shoot_location", (q) =>
        q.eq("shootLocationId", args.shootLocationId),
      )
      .collect();
    return await ctx.db.insert("shots", {
      orgId: scope.orgId,
      shootId: sl.shootId,
      shootLocationId: args.shootLocationId,
      order: existing.length,
      name: args.name,
      modelId: args.modelId ?? sl.modelIds?.[0],
      selectedVariationIds: [],
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("shots"),
    name: v.optional(v.string()),
    // Reference fields accept null to clear them (Convex drops `undefined`).
    modelId: v.optional(v.union(v.id("models"), v.null())),
    outfitId: v.optional(v.union(v.id("outfits"), v.null())),
    selectedVariationIds: v.optional(v.array(v.string())),
    posePrompt: v.optional(v.string()),
    clothingPrompt: v.optional(v.string()),
    extraPrompt: v.optional(v.string()),
    styleId: v.optional(v.union(v.id("presets"), v.null())),
    cameraId: v.optional(v.union(v.id("presets"), v.null())),
    lightingId: v.optional(v.union(v.id("presets"), v.null())),
    // null clears the aspect ratio back to the provider default ("Auto").
    aspectRatio: v.optional(v.union(v.string(), v.null())),
    cameraFraming: v.optional(v.any()),
  },
  handler: async (ctx, { id, ...args }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    // Convert nulls to `undefined` so ctx.db.patch removes those fields.
    const patch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(args)) {
      patch[k] = val === null ? undefined : val;
    }
    await ctx.db.patch(id, patch);
  },
});

/**
 * Copy a shot (settings only, not its generations). Defaults to the same
 * location; pass `shootLocationId` to copy it into a different location of the
 * SAME shoot (the target must belong to this shoot).
 */
export const duplicate = mutation({
  args: {
    id: v.id("shots"),
    shootLocationId: v.optional(v.id("shootLocations")),
  },
  handler: async (ctx, { id, shootLocationId }) => {
    const scope = await getScope(ctx);
    const shot = assertOrg(await ctx.db.get(id), scope);
    const targetSlId = shootLocationId ?? shot.shootLocationId;
    if (targetSlId !== shot.shootLocationId) {
      const target = assertOrg(await ctx.db.get(targetSlId), scope);
      if (target.shootId !== shot.shootId) {
        throw new Error("Target location is in a different shoot");
      }
    }
    const siblings = await ctx.db
      .query("shots")
      .withIndex("by_shoot_location", (q) =>
        q.eq("shootLocationId", targetSlId),
      )
      .collect();
    const order = Math.max(-1, ...siblings.map((s) => s.order)) + 1;
    const {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _id,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _creationTime,
      name,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      shootLocationId: _oldSl,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      order: _oldOrder,
      ...rest
    } = shot;
    return await ctx.db.insert("shots", {
      ...rest,
      shootLocationId: targetSlId,
      order,
      name: name ? `${name} (copy)` : undefined,
    });
  },
});

/** Move a shot to a different location within the same shoot. */
export const move = mutation({
  args: { id: v.id("shots"), shootLocationId: v.id("shootLocations") },
  handler: async (ctx, { id, shootLocationId }) => {
    const scope = await getScope(ctx);
    const shot = assertOrg(await ctx.db.get(id), scope);
    if (shootLocationId === shot.shootLocationId) return; // already here
    const target = assertOrg(await ctx.db.get(shootLocationId), scope);
    if (target.shootId !== shot.shootId) {
      throw new Error("Target location is in a different shoot");
    }
    const siblings = await ctx.db
      .query("shots")
      .withIndex("by_shoot_location", (q) =>
        q.eq("shootLocationId", shootLocationId),
      )
      .collect();
    const order = Math.max(-1, ...siblings.map((s) => s.order)) + 1;
    await ctx.db.patch(id, { shootLocationId, order });
  },
});

export const remove = mutation({
  args: { id: v.id("shots") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    const gens = await ctx.db
      .query("generations")
      .withIndex("by_shot", (q) => q.eq("shotId", id))
      .collect();
    for (const g of gens) await ctx.db.delete(g._id);
    await ctx.db.delete(id);
  },
});
