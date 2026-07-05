/**
 * V8 helpers for the media backfill (convex/backfillMedia.ts). Kept separate
 * from the node action so the DB reads/writes run in the fast query runtime.
 *
 * "Needs backfill" = a succeeded row with no `thumbnailUrl` yet (covers both
 * older Convex-stored images and fal-hosted ones).
 */
import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

/** A page of generations still missing a thumbnail. */
export const pendingGenerations = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const result = await ctx.db
      .query("generations")
      .order("desc")
      .paginate(paginationOpts);
    const rows = result.page
      .filter((g) => g.status === "succeeded" && !g.thumbnailUrl && g.imageUrl)
      .map((g) => ({ id: g._id, imageUrl: g.imageUrl! }));
    return { rows, continueCursor: result.continueCursor, isDone: result.isDone };
  },
});

/** A page of videos still missing a poster thumbnail. */
export const pendingVideos = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const result = await ctx.db
      .query("videos")
      .order("desc")
      .paginate(paginationOpts);
    const rows = result.page
      .filter((vd) => vd.status === "succeeded" && !vd.thumbnailUrl)
      .map((vd) => ({
        id: vd._id,
        videoUrl: vd.videoUrl,
        posterUrl: vd.posterUrl,
      }));
    return { rows, continueCursor: result.continueCursor, isDone: result.isDone };
  },
});

export const patchGeneration = internalMutation({
  args: {
    id: v.id("generations"),
    imageUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    thumbnailUrl: v.optional(v.string()),
    thumbStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, { id, ...patch }) => {
    await ctx.db.patch(id, patch);
  },
});

export const patchVideo = internalMutation({
  args: {
    id: v.id("videos"),
    videoUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    thumbnailUrl: v.optional(v.string()),
    thumbStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, { id, ...patch }) => {
    await ctx.db.patch(id, patch);
  },
});
