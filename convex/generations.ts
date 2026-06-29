import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { getScope, assertOrg } from "./lib/auth";

/** Shape succeeded generations into display photos (newest first, URLs resolved). */
async function shapeSucceeded(ctx: QueryCtx, gens: Doc<"generations">[]) {
  const succeeded = gens
    .filter((g) => g.status === "succeeded")
    .sort((a, b) => b._creationTime - a._creationTime);
  const out = await Promise.all(
    succeeded.map(async (g) => {
      let imageUrl = g.imageUrl;
      if (!imageUrl && g.storageId) {
        imageUrl = (await ctx.storage.getUrl(g.storageId)) ?? undefined;
      }
      return {
        _id: g._id,
        _creationTime: g._creationTime,
        imageUrl,
        shootId: g.shootId,
        shotId: g.shotId,
        modelLabel: g.modelLabel,
        prompt: g.prompt,
      };
    }),
  );
  return out.filter((g) => g.imageUrl);
}

/** Resolve everything needed to build a prompt for a shot. Internal-only. */
export const context = internalQuery({
  args: { shotId: v.id("shots") },
  handler: async (ctx, { shotId }) => {
    const shot = await ctx.db.get(shotId);
    if (!shot) throw new Error("Shot not found");
    const sl = await ctx.db.get(shot.shootLocationId);
    const location = sl ? await ctx.db.get(sl.locationId) : null;
    const shoot = await ctx.db.get(shot.shootId);
    const model = shot.modelId ? await ctx.db.get(shot.modelId) : null;
    const outfit = shot.outfitId ? await ctx.db.get(shot.outfitId) : null;
    const style = shot.styleId ? await ctx.db.get(shot.styleId) : null;
    const camera = shot.cameraId ? await ctx.db.get(shot.cameraId) : null;
    const lighting = shot.lightingId ? await ctx.db.get(shot.lightingId) : null;

    const resolveUrls = async (
      imgs: { storageId?: string; url?: string }[] | undefined,
    ) => {
      const out: string[] = [];
      for (const i of imgs ?? []) {
        let u = i.url;
        if (i.storageId) {
          const r = await ctx.storage.getUrl(i.storageId as never);
          if (r) u = r;
        }
        if (u) out.push(u);
      }
      return out;
    };

    return {
      orgId: shot.orgId,
      shootId: shot.shootId,
      scheduledAt: shoot?.scheduledAt ?? null,
      timezone: shoot?.timezone ?? null,
      shot: {
        name: shot.name,
        posePrompt: shot.posePrompt,
        clothingPrompt: shot.clothingPrompt,
        extraPrompt: shot.extraPrompt,
        cameraFraming: shot.cameraFraming ?? null,
        selectedVariationIds: shot.selectedVariationIds ?? [],
      },
      model: model
        ? {
            name: model.name,
            promptDescriptor: model.promptDescriptor,
            attributes: model.attributes ?? null,
            imageUrls: await resolveUrls(model.images),
          }
        : null,
      outfit: outfit
        ? {
            name: outfit.name,
            promptDescriptor: outfit.promptDescriptor,
            imageUrls: await resolveUrls(outfit.images),
            variations: await Promise.all(
              (outfit.variations ?? []).map(async (vrt) => ({
                id: vrt.id,
                name: vrt.name,
                promptDescriptor: vrt.promptDescriptor,
                imageUrls: await resolveUrls(vrt.images),
              })),
            ),
          }
        : null,
      location: location
        ? {
            name: location.name,
            address: location.address,
            promptDescriptor: location.promptDescriptor,
            streetViewUrls: await resolveUrls(location.streetViewRefs),
            imageUrls: await resolveUrls(location.images),
          }
        : null,
      style: style
        ? { name: style.name, promptDescriptor: style.promptDescriptor }
        : null,
      camera: camera
        ? { name: camera.name, promptDescriptor: camera.promptDescriptor }
        : null,
      lighting: lighting
        ? { name: lighting.name, promptDescriptor: lighting.promptDescriptor }
        : null,
    };
  },
});

export const create = internalMutation({
  args: {
    orgId: v.string(),
    createdBy: v.string(),
    shotId: v.id("shots"),
    shootId: v.id("shoots"),
    variationId: v.optional(v.string()),
    provider: v.string(),
    modelKey: v.string(),
    modelLabel: v.optional(v.string()),
    prompt: v.string(),
    negativePrompt: v.optional(v.string()),
    params: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("generations", {
      ...args,
      status: "generating",
    });
  },
});

export const attachResult = internalMutation({
  args: {
    id: v.id("generations"),
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

export const listByShoot = query({
  args: { shootId: v.id("shoots") },
  handler: async (ctx, { shootId }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(shootId), scope);
    return await ctx.db
      .query("generations")
      .withIndex("by_shoot", (q) => q.eq("shootId", shootId))
      .order("desc")
      .collect();
  },
});

/** All succeeded generations for the workspace, newest first (gallery). */
export const listByOrg = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const scope = await getScope(ctx);
    const rows = await ctx.db
      .query("generations")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .order("desc")
      .collect();
    const succeeded = rows.filter((g) => g.status === "succeeded");
    const sliced = limit ? succeeded.slice(0, limit) : succeeded;
    const out = await Promise.all(
      sliced.map(async (g) => {
        let imageUrl = g.imageUrl;
        if (!imageUrl && g.storageId) {
          imageUrl = (await ctx.storage.getUrl(g.storageId)) ?? undefined;
        }
        return {
          _id: g._id,
          _creationTime: g._creationTime,
          imageUrl,
          shootId: g.shootId,
          shotId: g.shotId,
          prompt: g.prompt,
          modelLabel: g.modelLabel,
        };
      }),
    );
    return out.filter((g) => g.imageUrl);
  },
});

/** All succeeded photos that feature a given model (via its shots). */
export const listByModel = query({
  args: { modelId: v.id("models") },
  handler: async (ctx, { modelId }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(modelId), scope);
    const shots = await ctx.db
      .query("shots")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .collect();
    const shotIds = new Set(
      shots.filter((s) => s.modelId === modelId).map((s) => s._id),
    );
    if (shotIds.size === 0) return [];
    const gens = await ctx.db
      .query("generations")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .collect();
    return shapeSucceeded(
      ctx,
      gens.filter((g) => shotIds.has(g.shotId)),
    );
  },
});

/** All succeeded photos shot at a given location (via its shoot-locations). */
export const listByLocation = query({
  args: { locationId: v.id("locations") },
  handler: async (ctx, { locationId }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(locationId), scope);
    const sls = await ctx.db
      .query("shootLocations")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .collect();
    const slIds = new Set(
      sls.filter((sl) => sl.locationId === locationId).map((sl) => sl._id),
    );
    if (slIds.size === 0) return [];
    const shots = await ctx.db
      .query("shots")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .collect();
    const shotIds = new Set(
      shots.filter((s) => slIds.has(s.shootLocationId)).map((s) => s._id),
    );
    if (shotIds.size === 0) return [];
    const gens = await ctx.db
      .query("generations")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .collect();
    return shapeSucceeded(
      ctx,
      gens.filter((g) => shotIds.has(g.shotId)),
    );
  },
});

export const remove = mutation({
  args: { id: v.id("generations") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    await ctx.db.delete(id);
  },
});
