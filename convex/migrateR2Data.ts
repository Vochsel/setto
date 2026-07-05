/**
 * V8 helpers for the R2 migration (convex/migrateR2.ts). Selects rows whose
 * media URLs don't yet point at the R2 public bucket, and patches them once the
 * node action has re-hosted the bytes.
 *
 * "Pending" is decided against `R2_PUBLIC_URL` (available to Convex functions
 * via process.env), so re-running is idempotent — migrated rows drop out.
 */
import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

function r2Prefix(): string {
  const base = process.env.R2_PUBLIC_URL?.replace(/\/+$/, "");
  return base ? base + "/" : "";
}
function onR2(url: string | undefined, prefix: string): boolean {
  return Boolean(prefix && url && url.startsWith(prefix));
}

export const pendingGenerations = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const prefix = r2Prefix();
    const result = await ctx.db
      .query("generations")
      .order("desc")
      .paginate(paginationOpts);
    const rows = result.page
      .filter(
        (g) =>
          g.status === "succeeded" &&
          g.imageUrl &&
          (!onR2(g.imageUrl, prefix) ||
            !g.thumbnailUrl ||
            !onR2(g.thumbnailUrl, prefix)),
      )
      .map((g) => ({
        id: g._id,
        imageUrl: g.imageUrl!,
        thumbnailUrl: g.thumbnailUrl,
      }));
    return { rows, continueCursor: result.continueCursor, isDone: result.isDone };
  },
});

export const pendingVideos = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const prefix = r2Prefix();
    const result = await ctx.db
      .query("videos")
      .order("desc")
      .paginate(paginationOpts);
    const rows = result.page
      .filter(
        (vd) =>
          vd.status === "succeeded" &&
          vd.videoUrl &&
          (!onR2(vd.videoUrl, prefix) ||
            (vd.thumbnailUrl && !onR2(vd.thumbnailUrl, prefix)) ||
            (vd.posterUrl && !onR2(vd.posterUrl, prefix))),
      )
      .map((vd) => ({
        id: vd._id,
        videoUrl: vd.videoUrl!,
        thumbnailUrl: vd.thumbnailUrl,
        posterUrl: vd.posterUrl,
      }));
    return { rows, continueCursor: result.continueCursor, isDone: result.isDone };
  },
});

export const patchGeneration = internalMutation({
  args: {
    id: v.id("generations"),
    imageUrl: v.string(),
    thumbnailUrl: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...patch }) => {
    await ctx.db.patch(id, patch);
  },
});

export const patchVideo = internalMutation({
  args: {
    id: v.id("videos"),
    videoUrl: v.string(),
    thumbnailUrl: v.optional(v.string()),
    posterUrl: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...patch }) => {
    await ctx.db.patch(id, patch);
  },
});
