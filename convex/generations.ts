import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
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
      // Recipe ids, frozen onto the generation so per-model / per-location
      // galleries stay accurate even after the shot is re-cast.
      modelId: shot.modelId ?? null,
      outfitId: shot.outfitId ?? null,
      locationId: sl?.locationId ?? null,
      styleId: shot.styleId ?? null,
      cameraId: shot.cameraId ?? null,
      lightingId: shot.lightingId ?? null,
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
    modelId: v.optional(v.id("models")),
    outfitId: v.optional(v.id("outfits")),
    locationId: v.optional(v.id("locations")),
    styleId: v.optional(v.id("presets")),
    cameraId: v.optional(v.id("presets")),
    lightingId: v.optional(v.id("presets")),
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

export const setProgress = internalMutation({
  args: {
    id: v.id("generations"),
    status: v.optional(
      v.union(
        v.literal("queued"),
        v.literal("generating"),
        v.literal("succeeded"),
        v.literal("failed"),
      ),
    ),
    progress: v.optional(v.number()),
    progressLabel: v.optional(v.string()),
    falRequestId: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...patch }) => {
    await ctx.db.patch(id, patch);
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
    // Clear any in-flight progress when the final result lands.
    await ctx.db.patch(id, { progressLabel: undefined, ...patch });
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

/**
 * Paginated feed of ALL image generations (every status), newest first, for the
 * queue page. Merged client-side with the video feed. Items carry `shotId` so
 * each links back to its source shot.
 */
export const queueFeed = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const scope = await getScope(ctx);
    const result = await ctx.db
      .query("generations")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .order("desc")
      .paginate(paginationOpts);

    const page = await Promise.all(
      result.page.map(async (g) => {
        let thumbUrl = g.imageUrl;
        if (!thumbUrl && g.storageId) {
          thumbUrl = (await ctx.storage.getUrl(g.storageId)) ?? undefined;
        }
        return {
          kind: "image" as const,
          _id: g._id as string,
          _creationTime: g._creationTime,
          status: g.status,
          thumbUrl,
          videoUrl: undefined as string | undefined,
          modelKey: g.modelKey,
          modelLabel: g.modelLabel,
          prompt: g.prompt,
          progress: g.progress,
          progressLabel: g.progressLabel,
          error: g.error,
          shootId: g.shootId as string,
          shotId: g.shotId as string,
        };
      }),
    );
    return { ...result, page };
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

/**
 * All succeeded photos that feature a given model.
 *
 * Each generation carries a frozen `modelId` snapshot of the shot's recipe at
 * the time it was produced, so re-casting a shot to a different model never
 * re-attributes images that were already made. Rows created before snapshots
 * existed (`modelId` undefined) fall back to the shot's *current* model.
 */
export const listByModel = query({
  args: { modelId: v.id("models") },
  handler: async (ctx, { modelId }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(modelId), scope);
    const gens = await ctx.db
      .query("generations")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .collect();

    // Resolve a fallback model only for legacy rows missing the snapshot.
    const legacyShotIds = new Set(
      gens.filter((g) => g.modelId === undefined).map((g) => g.shotId),
    );
    const shotModel = new Map<string, string | undefined>();
    await Promise.all(
      [...legacyShotIds].map(async (sid) => {
        const shot = await ctx.db.get(sid);
        shotModel.set(sid, shot?.modelId);
      }),
    );

    const effectiveModelId = (g: Doc<"generations">) =>
      g.modelId ?? shotModel.get(g.shotId);
    return shapeSucceeded(
      ctx,
      gens.filter((g) => effectiveModelId(g) === modelId),
    );
  },
});

/**
 * All succeeded photos shot at a given location.
 *
 * Mirrors `listByModel`: prefers each generation's frozen `locationId`
 * snapshot and only falls back to resolving the shot's current location for
 * legacy rows that predate snapshots.
 */
export const listByLocation = query({
  args: { locationId: v.id("locations") },
  handler: async (ctx, { locationId }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(locationId), scope);
    const gens = await ctx.db
      .query("generations")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .collect();

    // For legacy rows, resolve location via shot -> shootLocation.
    const legacyShotIds = new Set(
      gens.filter((g) => g.locationId === undefined).map((g) => g.shotId),
    );
    const shotLocation = new Map<string, string | undefined>();
    await Promise.all(
      [...legacyShotIds].map(async (sid) => {
        const shot = await ctx.db.get(sid);
        const sl = shot ? await ctx.db.get(shot.shootLocationId) : null;
        shotLocation.set(sid, sl?.locationId);
      }),
    );

    const effectiveLocationId = (g: Doc<"generations">) =>
      g.locationId ?? shotLocation.get(g.shotId);
    return shapeSucceeded(
      ctx,
      gens.filter((g) => effectiveLocationId(g) === locationId),
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
