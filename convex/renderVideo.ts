"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  renderMediaOnLambda,
  getRenderProgress,
  type AwsRegion,
} from "@remotion/lambda/client";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Execute a queued video export on Remotion Lambda and stream progress back to
 * its `videoRenders` row. Scheduled by `videoRenders.start`. Mirrors the
 * fal i2v render flow: trigger → poll progress → attach the output URL.
 *
 * Requires the Lambda to be deployed (see packages/remotion/scripts/deploy.ts)
 * and these env vars on the Convex deployment:
 *   REMOTION_LAMBDA_FUNCTION_NAME, REMOTION_SERVE_URL, REMOTION_REGION,
 *   REMOTION_AWS_ACCESS_KEY_ID, REMOTION_AWS_SECRET_ACCESS_KEY
 */
export const run = internalAction({
  args: { renderId: v.id("videoRenders") },
  handler: async (ctx, { renderId }) => {
    const fail = async (error: string) => {
      await ctx.runMutation(internal.videoRenders.attachResult, {
        renderId,
        status: "failed",
        error,
      });
      await ctx.runMutation(internal.usage.recordForVideoExport, {
        renderId,
        status: "failed",
        error,
      });
    };

    const render = await ctx.runQuery(internal.videoRenders.getInternal, {
      renderId,
    });
    if (!render) return;

    const functionName = process.env.REMOTION_LAMBDA_FUNCTION_NAME;
    const serveUrl = process.env.REMOTION_SERVE_URL;
    const region = (process.env.REMOTION_REGION ?? "us-east-1") as AwsRegion;
    if (!functionName || !serveUrl) {
      return fail(
        "Remotion Lambda is not configured. Deploy it (pnpm --filter @setto/remotion deploy) " +
          "and set REMOTION_LAMBDA_FUNCTION_NAME / REMOTION_SERVE_URL / REMOTION_REGION " +
          "(plus REMOTION_AWS_* credentials) on this Convex deployment.",
      );
    }

    try {
      const { renderId: remId, bucketName } = await renderMediaOnLambda({
        region,
        functionName,
        serveUrl,
        composition: "Timeline",
        inputProps: render.spec,
        codec: "h264",
        imageFormat: "jpeg",
        privacy: "public",
        downloadBehavior: { type: "play-in-browser" },
      });

      await ctx.runMutation(internal.videoRenders.setProgress, {
        renderId,
        status: "rendering",
        progress: 0.05,
        progressLabel: "Rendering…",
        renderId_remotion: remId,
        bucketName,
        renderRegion: region,
      });

      // Poll until done. Cap total wait so a stuck render can't run forever.
      const deadline = Date.now() + 8 * 60 * 1000;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (Date.now() > deadline) {
          return fail("Render timed out after 8 minutes");
        }
        await sleep(3000);
        const progress = await getRenderProgress({
          renderId: remId,
          bucketName,
          functionName,
          region,
        });
        if (progress.fatalErrorEncountered) {
          return fail(progress.errors?.[0]?.message ?? "Render failed on Lambda");
        }
        if (progress.done) {
          await ctx.runMutation(internal.videoRenders.attachResult, {
            renderId,
            status: "succeeded",
            outputUrl: progress.outputFile ?? undefined,
            costUsd: progress.costs?.accruedSoFar,
          });
          await ctx.runMutation(internal.usage.recordForVideoExport, {
            renderId,
            status: "succeeded",
            costUsd: progress.costs?.accruedSoFar,
          });
          return;
        }
        await ctx.runMutation(internal.videoRenders.setProgress, {
          renderId,
          status: "rendering",
          progress: Math.max(0.05, progress.overallProgress),
          progressLabel: `Rendering… ${Math.round(progress.overallProgress * 100)}%`,
        });
      }
    } catch (e) {
      await fail(e instanceof Error ? e.message : String(e));
    }
  },
});
