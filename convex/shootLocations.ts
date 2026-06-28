import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getScope, assertOrg } from "./lib/auth";
import { resolveImages } from "./files";

/** Locations within a shoot, each with its resolved location + present models. */
export const listByShoot = query({
  args: { shootId: v.id("shoots") },
  handler: async (ctx, { shootId }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(shootId), scope);
    const rows = await ctx.db
      .query("shootLocations")
      .withIndex("by_shoot", (q) => q.eq("shootId", shootId))
      .collect();
    rows.sort((a, b) => a.order - b.order);

    return Promise.all(
      rows.map(async (sl) => {
        const location = await ctx.db.get(sl.locationId);
        const models = (
          await Promise.all((sl.modelIds ?? []).map((id) => ctx.db.get(id)))
        ).filter(Boolean);
        return {
          ...sl,
          location: location
            ? {
                ...location,
                streetViewUrls: await resolveImages(ctx, location.streetViewRefs),
                imageUrls: await resolveImages(ctx, location.images),
              }
            : null,
          models: await Promise.all(
            models.map(async (m) => ({
              _id: m!._id,
              name: m!.name,
              imageUrls: await resolveImages(ctx, m!.images),
            })),
          ),
        };
      }),
    );
  },
});

/** Add a saved location to a shoot. */
export const add = mutation({
  args: { shootId: v.id("shoots"), locationId: v.id("locations") },
  handler: async (ctx, { shootId, locationId }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(shootId), scope);
    assertOrg(await ctx.db.get(locationId), scope);
    const existing = await ctx.db
      .query("shootLocations")
      .withIndex("by_shoot", (q) => q.eq("shootId", shootId))
      .collect();
    if (existing.some((e) => e.locationId === locationId)) {
      return existing.find((e) => e.locationId === locationId)!._id;
    }
    return await ctx.db.insert("shootLocations", {
      orgId: scope.orgId,
      shootId,
      locationId,
      order: existing.length,
      modelIds: [],
    });
  },
});

export const setModels = mutation({
  args: { id: v.id("shootLocations"), modelIds: v.array(v.id("models")) },
  handler: async (ctx, { id, modelIds }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    await ctx.db.patch(id, { modelIds });
  },
});

export const setNotes = mutation({
  args: { id: v.id("shootLocations"), notes: v.string() },
  handler: async (ctx, { id, notes }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    await ctx.db.patch(id, { notes });
  },
});

/** Persist the Three.js staging scene for a location. */
export const saveStaging = mutation({
  args: { id: v.id("shootLocations"), staging: v.any() },
  handler: async (ctx, { id, staging }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    await ctx.db.patch(id, { staging });
  },
});

export const reorder = mutation({
  args: { ids: v.array(v.id("shootLocations")) },
  handler: async (ctx, { ids }) => {
    const scope = await getScope(ctx);
    for (let i = 0; i < ids.length; i++) {
      assertOrg(await ctx.db.get(ids[i]), scope);
      await ctx.db.patch(ids[i], { order: i });
    }
  },
});

export const remove = mutation({
  args: { id: v.id("shootLocations") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    const sl = assertOrg(await ctx.db.get(id), scope);
    // Remove shots tied to this location.
    const shots = await ctx.db
      .query("shots")
      .withIndex("by_shoot_location", (q) => q.eq("shootLocationId", id))
      .collect();
    for (const s of shots) await ctx.db.delete(s._id);
    await ctx.db.delete(sl._id);
  },
});
