"use node";
/**
 * One-off migration: move existing media (Convex-stored originals AND lingering
 * fal CDN links) onto Cloudflare R2, rewriting each row's URLs to the R2 public
 * bucket. Drive it in batches from the CLI:
 *
 *   npx convex run migrateR2:runImages '{"limit":25}'
 *   # repeat with the returned cursor until isDone:
 *   npx convex run migrateR2:runImages '{"limit":25,"cursor":"<cursor>"}'
 *   npx convex run migrateR2:runVideos '{"limit":10}'
 *
 * Requires R2 to be fully configured (R2_PUBLIC_URL set) — otherwise it aborts,
 * since without a public URL there's nothing to migrate to. Idempotent: rows
 * whose URLs already point at R2 are filtered out by the data query, and any
 * URL already on R2 is left untouched. Dead source URLs are counted + skipped.
 */
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { fetchBytes, makeThumbnail, thumbnailFromUrl } from "./lib/media";
import { putToR2, isR2Url, r2Enabled } from "./lib/r2";

interface MigrateResult {
  processed: number;
  failed: number;
  scanned: number;
  isDone: boolean;
  cursor: string;
}

/** Fetch a URL's bytes and re-host them on R2, returning the new public URL. */
async function rehost(url: string, folder: string): Promise<string> {
  const { bytes, contentType } = await fetchBytes(url);
  const { url: newUrl } = await putToR2(bytes, contentType, folder);
  return newUrl;
}

export const runImages = action({
  args: { limit: v.optional(v.number()), cursor: v.optional(v.string()) },
  handler: async (ctx, { limit, cursor }): Promise<MigrateResult> => {
    if (!r2Enabled()) throw new Error("R2 not configured (set R2_PUBLIC_URL)");
    const numItems = limit ?? 25;
    const page = await ctx.runQuery(internal.migrateR2Data.pendingGenerations, {
      paginationOpts: { numItems, cursor: cursor ?? null },
    });
    let processed = 0;
    let failed = 0;
    for (const row of page.rows) {
      try {
        // Re-host the original if it isn't already on R2, keeping its bytes so
        // we can also derive a thumbnail without a second fetch.
        let imageUrl = row.imageUrl;
        let imgBytes: Buffer | undefined;
        if (!isR2Url(row.imageUrl)) {
          const f = await fetchBytes(row.imageUrl);
          imgBytes = f.bytes;
          const { url } = await putToR2(f.bytes, f.contentType, "img");
          imageUrl = url;
        }

        let thumbnailUrl = row.thumbnailUrl;
        if (row.thumbnailUrl && isR2Url(row.thumbnailUrl)) {
          // already migrated
        } else if (row.thumbnailUrl) {
          thumbnailUrl = await rehost(row.thumbnailUrl, "thumb");
        } else {
          // No thumbnail yet — derive one from the original bytes.
          if (!imgBytes) imgBytes = (await fetchBytes(row.imageUrl)).bytes;
          const thumb = await makeThumbnail(imgBytes);
          const { url } = await putToR2(thumb, "image/webp", "thumb");
          thumbnailUrl = url;
        }

        await ctx.runMutation(internal.migrateR2Data.patchGeneration, {
          id: row.id,
          imageUrl,
          thumbnailUrl: thumbnailUrl ?? imageUrl,
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
  handler: async (ctx, { limit, cursor }): Promise<MigrateResult> => {
    if (!r2Enabled()) throw new Error("R2 not configured (set R2_PUBLIC_URL)");
    const numItems = limit ?? 10;
    const page = await ctx.runQuery(internal.migrateR2Data.pendingVideos, {
      paginationOpts: { numItems, cursor: cursor ?? null },
    });
    let processed = 0;
    let failed = 0;
    for (const row of page.rows) {
      try {
        let videoUrl = row.videoUrl;
        if (!isR2Url(row.videoUrl)) {
          videoUrl = await rehost(row.videoUrl, "vid");
        }

        let thumbnailUrl = row.thumbnailUrl;
        if (row.thumbnailUrl && !isR2Url(row.thumbnailUrl)) {
          thumbnailUrl = await rehost(row.thumbnailUrl, "thumb");
        } else if (!row.thumbnailUrl && row.posterUrl) {
          const t = await thumbnailFromUrl(ctx, row.posterUrl);
          thumbnailUrl = t?.url ?? undefined;
        }

        // Reuse the (R2) thumbnail as the poster to avoid a duplicate full-res
        // upload; fall back to re-hosting the poster if we have no R2 thumb.
        let posterUrl = row.posterUrl;
        if (row.posterUrl && !isR2Url(row.posterUrl)) {
          posterUrl =
            thumbnailUrl && isR2Url(thumbnailUrl)
              ? thumbnailUrl
              : await rehost(row.posterUrl, "img");
        }

        await ctx.runMutation(internal.migrateR2Data.patchVideo, {
          id: row.id,
          videoUrl,
          thumbnailUrl,
          posterUrl,
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
