"use node";
/**
 * One-off backfill: sync existing generated images/videos into Convex storage
 * and give each a WebP thumbnail. Drive it in batches from the CLI:
 *
 *   npx convex run backfillMedia:runImages '{"limit":25}'
 *   # repeat with the returned cursor until isDone:
 *   npx convex run backfillMedia:runImages '{"limit":25,"cursor":"<cursor>"}'
 *   npx convex run backfillMedia:runVideos '{"limit":10}'
 *
 * Idempotent — rows that already have a thumbnail are skipped, so re-running is
 * safe. Failures (dead fal URLs) are counted and skipped, not fatal.
 */
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  storeImageFromUrl,
  storeFromUrl,
  thumbnailFromUrl,
} from "./lib/media";
import type { Id } from "./_generated/dataModel";

interface BackfillResult {
  processed: number;
  failed: number;
  scanned: number;
  isDone: boolean;
  cursor: string;
}

export const runImages = action({
  args: { limit: v.optional(v.number()), cursor: v.optional(v.string()) },
  handler: async (ctx, { limit, cursor }): Promise<BackfillResult> => {
    const numItems = limit ?? 25;
    const page = await ctx.runQuery(
      internal.backfillMediaData.pendingGenerations,
      { paginationOpts: { numItems, cursor: cursor ?? null } },
    );
    let processed = 0;
    let failed = 0;
    for (const row of page.rows) {
      try {
        const stored = await storeImageFromUrl(ctx, row.imageUrl);
        await ctx.runMutation(internal.backfillMediaData.patchGeneration, {
          id: row.id,
          imageUrl: stored.url,
          storageId: stored.storageId,
          thumbnailUrl: stored.thumbnailUrl ?? stored.url,
          thumbStorageId: stored.thumbStorageId,
        });
        processed++;
      } catch {
        failed++;
      }
    }
    return {
      processed,
      failed,
      scanned: page.rows.length,
      isDone: page.isDone,
      cursor: page.continueCursor,
    };
  },
});

export const runVideos = action({
  args: { limit: v.optional(v.number()), cursor: v.optional(v.string()) },
  handler: async (ctx, { limit, cursor }): Promise<BackfillResult> => {
    const numItems = limit ?? 10;
    const page = await ctx.runQuery(internal.backfillMediaData.pendingVideos, {
      paginationOpts: { numItems, cursor: cursor ?? null },
    });
    let processed = 0;
    let failed = 0;
    for (const row of page.rows) {
      try {
        // Sync the video bytes into Convex (best-effort) + a poster thumbnail.
        let videoUrl = row.videoUrl;
        let storageId: Id<"_storage"> | undefined;
        if (row.videoUrl) {
          try {
            const stored = await storeFromUrl(ctx, row.videoUrl);
            videoUrl = stored.url;
            storageId = stored.storageId;
          } catch {
            // keep the existing url
          }
        }
        const thumb = row.posterUrl
          ? await thumbnailFromUrl(ctx, row.posterUrl)
          : null;
        await ctx.runMutation(internal.backfillMediaData.patchVideo, {
          id: row.id,
          videoUrl,
          storageId,
          thumbnailUrl: thumb?.url ?? row.posterUrl,
          thumbStorageId: thumb?.storageId,
        });
        processed++;
      } catch {
        failed++;
      }
    }
    return {
      processed,
      failed,
      scanned: page.rows.length,
      isDone: page.isDone,
      cursor: page.continueCursor,
    };
  },
});
