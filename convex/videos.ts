import {
  internalMutation,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { getScope, assertOrg } from "./lib/auth";
import {
  getVideoModel,
  DEFAULT_VIDEO_MODEL_ID,
} from "./lib/videoModels";

/** Shape succeeded videos into display items (newest first, urls resolved). */
async function shapeSucceeded(ctx: QueryCtx, vids: Doc<"videos">[]) {
  const succeeded = vids
    .filter((g) => g.status === "succeeded" && g.videoUrl)
    .sort((a, b) => b._creationTime - a._creationTime);
  return succeeded.map((g) => ({
    _id: g._id,
    _creationTime: g._creationTime,
    videoUrl: g.videoUrl,
    posterUrl: g.posterUrl,
    prompt: g.prompt,
    modelId: g.modelId,
    modelLabel: g.modelLabel,
    shootId: g.shootId,
    shotId: g.shotId,
    rating: g.rating,
    reviewStatus: g.reviewStatus,
    favorite: g.favorite,
  }));
}

/**
 * Kick off an image-to-video render from a source generation image. Inserts a
 * `videos` row (status "queued") and schedules the slow fal call on a node
 * action, so the request returns immediately. Many videos can be created from
 * the same image — one per call.
 */
export const generate = mutation({
  args: {
    generationId: v.id("generations"),
    modelKey: v.optional(v.string()),
    prompt: v.string(),
    durationSeconds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const scope = await getScope(ctx);
    const gen = assertOrg(await ctx.db.get(args.generationId), scope);
    if (gen.status !== "succeeded") {
      throw new Error("Can only animate a finished image");
    }

    const modelKey = args.modelKey ?? DEFAULT_VIDEO_MODEL_ID;
    const model = getVideoModel(modelKey);
    if (!model) throw new Error(`Unknown video model: ${modelKey}`);

    // Clamp the requested duration to one the model actually supports.
    const requested = args.durationSeconds ?? model.defaultDuration;
    const duration = model.durations.includes(requested)
      ? requested
      : model.defaultDuration;

    const prompt = args.prompt.trim();
    if (!prompt) throw new Error("A prompt is required to animate an image");

    // Resolve the source image url for both fal input and the video poster.
    let posterUrl = gen.imageUrl;
    if (!posterUrl && gen.storageId) {
      posterUrl = (await ctx.storage.getUrl(gen.storageId)) ?? undefined;
    }
    if (!posterUrl) throw new Error("Source image is not available");

    const videoId = await ctx.db.insert("videos", {
      orgId: scope.orgId,
      createdBy: scope.userId,
      generationId: args.generationId,
      shotId: gen.shotId,
      shootId: gen.shootId,
      // Freeze the source image's recipe snapshot so per-model / per-location
      // galleries attribute this video the same way they attribute the image.
      modelId: gen.modelId,
      locationId: gen.locationId,
      provider: model.provider,
      modelKey,
      modelLabel: model.label,
      prompt,
      durationSeconds: duration,
      status: "queued",
      progress: 0,
      progressLabel: "Queued",
      posterUrl,
    });

    await ctx.scheduler.runAfter(0, internal.generateVideo.runVideo, {
      videoId,
      modelKey,
      prompt,
      imageUrl: posterUrl,
      durationSeconds: duration,
    });

    return { videoId };
  },
});

export const setProgress = internalMutation({
  args: {
    id: v.id("videos"),
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
    id: v.id("videos"),
    status: v.union(v.literal("succeeded"), v.literal("failed")),
    videoUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    seed: v.optional(v.number()),
    falRequestId: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { id, status, ...patch }) => {
    await ctx.db.patch(id, {
      status,
      progress: status === "succeeded" ? 1 : undefined,
      progressLabel: undefined,
      ...patch,
    });
  },
});

/** All videos for a single source image (newest first). */
export const listByGeneration = query({
  args: { generationId: v.id("generations") },
  handler: async (ctx, { generationId }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(generationId), scope);
    return await ctx.db
      .query("videos")
      .withIndex("by_generation", (q) => q.eq("generationId", generationId))
      .order("desc")
      .collect();
  },
});

/**
 * Paginated feed of ALL video renders (every status), newest first, for the
 * queue page. Merged client-side with the image feed. Items carry `shotId` so
 * each links back to its source shot.
 */
export const queueFeed = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const scope = await getScope(ctx);
    const result = await ctx.db
      .query("videos")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .order("desc")
      .paginate(paginationOpts);

    const page = result.page.map((vd) => ({
      kind: "video" as const,
      _id: vd._id as string,
      _creationTime: vd._creationTime,
      status: vd.status,
      thumbUrl: vd.posterUrl,
      videoUrl: vd.videoUrl,
      modelKey: vd.modelKey,
      modelLabel: vd.modelLabel,
      prompt: vd.prompt,
      progress: vd.progress,
      progressLabel: vd.progressLabel,
      error: vd.error,
      shootId: vd.shootId as string,
      shotId: vd.shotId as string,
      rating: vd.rating,
      reviewStatus: vd.reviewStatus,
      favorite: vd.favorite,
    }));
    return { ...result, page };
  },
});

/** All succeeded videos for the workspace, newest first (gallery). */
export const listByOrg = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const scope = await getScope(ctx);
    const rows = await ctx.db
      .query("videos")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .order("desc")
      .collect();
    const shaped = await shapeSucceeded(ctx, rows);
    return limit ? shaped.slice(0, limit) : shaped;
  },
});

/** Succeeded videos featuring a given model (frozen snapshot, like images). */
export const listByModel = query({
  args: { modelId: v.id("models") },
  handler: async (ctx, { modelId }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(modelId), scope);
    const vids = await ctx.db
      .query("videos")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .collect();
    return shapeSucceeded(
      ctx,
      vids.filter((g) => g.modelId === modelId),
    );
  },
});

/** Succeeded videos shot at a given location (frozen snapshot, like images). */
export const listByLocation = query({
  args: { locationId: v.id("locations") },
  handler: async (ctx, { locationId }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(locationId), scope);
    const vids = await ctx.db
      .query("videos")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .collect();
    return shapeSucceeded(
      ctx,
      vids.filter((g) => g.locationId === locationId),
    );
  },
});

/**
 * Succeeded videos featuring a given outfit. Videos carry no `outfitId`
 * snapshot, so we resolve it through the source generation (frozen `outfitId`,
 * with a legacy fallback to the shot's current outfit).
 */
export const listByOutfit = query({
  args: { outfitId: v.id("outfits") },
  handler: async (ctx, { outfitId }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(outfitId), scope);

    const gens = await ctx.db
      .query("generations")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .collect();
    const legacyShotIds = new Set(
      gens.filter((g) => g.outfitId === undefined).map((g) => g.shotId),
    );
    const shotOutfit = new Map<string, string | undefined>();
    await Promise.all(
      [...legacyShotIds].map(async (sid) => {
        const shot = await ctx.db.get(sid);
        shotOutfit.set(sid, shot?.outfitId);
      }),
    );
    const genIds = new Set(
      gens
        .filter((g) => (g.outfitId ?? shotOutfit.get(g.shotId)) === outfitId)
        .map((g) => g._id),
    );

    const vids = await ctx.db
      .query("videos")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .collect();
    return shapeSucceeded(
      ctx,
      vids.filter((g) => genIds.has(g.generationId)),
    );
  },
});

export const remove = mutation({
  args: { id: v.id("videos") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    await ctx.db.delete(id);
  },
});
