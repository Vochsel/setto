"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { fal } from "@fal-ai/client";
import { getVideoModel, buildFalVideoInput } from "./lib/videoModels";
import { storeFromUrl, thumbnailFromUrl } from "./lib/media";

/**
 * Execute a single queued video render against its fal i2v endpoint and store
 * the resulting (fal-hosted) URL. Scheduled by `videos.generate` so the slow
 * render runs in the background and streams progress back via queue updates.
 */
export const runVideo = internalAction({
  args: {
    videoId: v.id("videos"),
    modelKey: v.string(),
    prompt: v.string(),
    imageUrl: v.string(),
    durationSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const fail = async (error: string) => {
      await ctx.runMutation(internal.videos.attachResult, {
        id: args.videoId,
        status: "failed",
        error,
      });
      await ctx.runMutation(internal.usage.recordForVideo, {
        videoId: args.videoId,
        status: "failed",
        error,
      });
    };

    const model = getVideoModel(args.modelKey);
    if (!model) return fail(`Unknown video model: ${args.modelKey}`);

    const apiKey = process.env.FAL_KEY;
    if (!apiKey) {
      return fail("FAL_KEY is not set. Run: npx convex env set FAL_KEY <key>");
    }

    try {
      fal.config({ credentials: apiKey });
      const input = buildFalVideoInput(model, {
        prompt: args.prompt,
        imageUrl: args.imageUrl,
        duration: args.durationSeconds,
      });

      // Stream coarse progress back to the row as the fal queue advances. The
      // callback is sync, so we fire-and-forget the patch (only on transitions).
      let last = "";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = await fal.subscribe(model.falEndpoint, {
        input,
        onQueueUpdate: (update) => {
          if (update.status === last) return;
          last = update.status;
          if (update.status === "IN_QUEUE") {
            const pos =
              "queue_position" in update ? update.queue_position : undefined;
            void ctx.runMutation(internal.videos.setProgress, {
              id: args.videoId,
              status: "generating",
              progress: 0.1,
              progressLabel:
                pos != null ? `In queue (${pos})` : "In queue…",
            });
          } else if (update.status === "IN_PROGRESS") {
            void ctx.runMutation(internal.videos.setProgress, {
              id: args.videoId,
              status: "generating",
              progress: 0.5,
              progressLabel: "Rendering…",
            });
          }
        },
      });

      const data = result?.data ?? result;
      const falUrl =
        data?.video?.url ??
        data?.video_url ??
        data?.videos?.[0]?.url ??
        data?.url;
      if (!falUrl) throw new Error("fal returned no video URL");

      // Own the bytes: pull the fal video into Convex storage; fall back to the
      // fal URL if that fails so a storage hiccup never loses the render.
      let videoUrl = falUrl;
      let storageId: Id<"_storage"> | undefined;
      try {
        const stored = await storeFromUrl(ctx, falUrl);
        videoUrl = stored.url;
        storageId = stored.storageId;
      } catch {
        // keep the fal URL
      }
      // A small WebP poster thumbnail from the source image, for grids.
      const thumb = await thumbnailFromUrl(ctx, args.imageUrl);

      await ctx.runMutation(internal.videos.attachResult, {
        id: args.videoId,
        status: "succeeded",
        videoUrl,
        storageId,
        thumbnailUrl: thumb?.url,
        thumbStorageId: thumb?.storageId,
        seed: typeof data?.seed === "number" ? data.seed : undefined,
        falRequestId: result?.requestId,
      });
      await ctx.runMutation(internal.usage.recordForVideo, {
        videoId: args.videoId,
        status: "succeeded",
      });
    } catch (e) {
      await fail(e instanceof Error ? e.message : String(e));
    }
  },
});
