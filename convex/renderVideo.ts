"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  renderMediaOnLambda,
  getRenderProgress,
  type AwsRegion,
} from "@remotion/lambda/client";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Execute a queued video export and store the resulting mp4 URL. Scheduled by
 * `videoRenders.start`. Two backends, chosen by env:
 *   1. REMOTION_RENDER_URL  → a Vercel Fluid Compute container (preferred).
 *      Synchronous: POST the spec, get back a Vercel Blob mp4 URL.
 *   2. REMOTION_LAMBDA_*     → Remotion Lambda (fallback). Trigger + poll.
 * If neither is configured, the render fails with a setup message.
 */
export const run = internalAction({
  args: { renderId: v.id("videoRenders") },
  handler: async (ctx, { renderId }) => {
    const render = await ctx.runQuery(internal.videoRenders.getInternal, {
      renderId,
    });
    if (!render) return;

    const containerUrl = process.env.REMOTION_RENDER_URL;
    if (containerUrl) {
      await renderViaContainer(ctx, renderId, render.spec, containerUrl);
      return;
    }
    await renderViaLambda(ctx, renderId, render.spec);
  },
});

async function fail(
  ctx: ActionCtx,
  renderId: Id<"videoRenders">,
  error: string,
) {
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
}

// ── Vercel container backend ────────────────────────────────────────────────

async function renderViaContainer(
  ctx: ActionCtx,
  renderId: Id<"videoRenders">,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  spec: any,
  baseUrl: string,
) {
  await ctx.runMutation(internal.videoRenders.setProgress, {
    renderId,
    status: "rendering",
    progress: 0.1,
    progressLabel: "Rendering on Vercel…",
  });
  try {
    const secret = process.env.RENDER_SECRET;
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/render`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify({ spec, renderId }),
    });
    if (!res.ok) {
      throw new Error(`Render service ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as { url?: string; error?: string };
    if (data.error || !data.url) {
      throw new Error(data.error ?? "Render service returned no URL");
    }
    await ctx.runMutation(internal.videoRenders.attachResult, {
      renderId,
      status: "succeeded",
      outputUrl: data.url,
    });
    await ctx.runMutation(internal.usage.recordForVideoExport, {
      renderId,
      status: "succeeded",
    });
  } catch (e) {
    await fail(ctx, renderId, e instanceof Error ? e.message : String(e));
  }
}

// ── Remotion Lambda backend (fallback) ──────────────────────────────────────

async function renderViaLambda(
  ctx: ActionCtx,
  renderId: Id<"videoRenders">,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  spec: any,
) {
  const functionName = process.env.REMOTION_LAMBDA_FUNCTION_NAME;
  const serveUrl = process.env.REMOTION_SERVE_URL;
  const region = (process.env.REMOTION_REGION ?? "us-east-1") as AwsRegion;
  if (!functionName || !serveUrl) {
    return fail(
      ctx,
      renderId,
      "No renderer configured. Set REMOTION_RENDER_URL (Vercel container) or " +
        "the REMOTION_LAMBDA_* env vars on this Convex deployment.",
    );
  }

  try {
    const { renderId: remId, bucketName } = await renderMediaOnLambda({
      region,
      functionName,
      serveUrl,
      composition: "Timeline",
      inputProps: spec,
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

    const deadline = Date.now() + 8 * 60 * 1000;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (Date.now() > deadline) return fail(ctx, renderId, "Render timed out");
      await sleep(3000);
      const progress = await getRenderProgress({
        renderId: remId,
        bucketName,
        functionName,
        region,
      });
      if (progress.fatalErrorEncountered) {
        return fail(ctx, renderId, progress.errors?.[0]?.message ?? "Render failed");
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
    await fail(ctx, renderId, e instanceof Error ? e.message : String(e));
  }
}
