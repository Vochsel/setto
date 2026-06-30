import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getScope, assertOrg } from "./lib/auth";
import { specDurationMs, type VideoSpec } from "@setto/core/video";

/**
 * Kick off an mp4 export of a project. Snapshots the current spec into a
 * `videoRenders` row (so the export is reproducible and self-contained) and
 * schedules the slow Remotion Lambda render on a node action. Returns
 * immediately; progress streams back onto the row.
 */
export const start = mutation({
  args: { projectId: v.id("videoProjects") },
  handler: async (ctx, { projectId }) => {
    const scope = await getScope(ctx);
    const project = assertOrg(await ctx.db.get(projectId), scope);
    if (!project.clips.length) {
      throw new Error("Add at least one clip before exporting");
    }

    const spec: VideoSpec = {
      templateId: project.templateId,
      width: project.width,
      height: project.height,
      fps: project.fps,
      background: project.background,
      clips: project.clips,
      audio: project.audio,
    };
    const durationMs = specDurationMs(spec);

    const renderId = await ctx.db.insert("videoRenders", {
      orgId: scope.orgId,
      createdBy: scope.userId,
      projectId,
      spec,
      width: spec.width,
      height: spec.height,
      fps: spec.fps,
      durationMs,
      status: "queued",
      progress: 0,
      progressLabel: "Queued",
      posterUrl: project.posterUrl,
    });

    await ctx.scheduler.runAfter(0, internal.renderVideo.run, { renderId });
    return { renderId };
  },
});

// ── Internal getters / progress / result (used by the node action) ──────────

export const getInternal = internalQuery({
  args: { renderId: v.id("videoRenders") },
  handler: async (ctx, { renderId }) => ctx.db.get(renderId),
});

export const setProgress = internalMutation({
  args: {
    renderId: v.id("videoRenders"),
    status: v.optional(
      v.union(
        v.literal("queued"),
        v.literal("rendering"),
        v.literal("succeeded"),
        v.literal("failed"),
      ),
    ),
    progress: v.optional(v.number()),
    progressLabel: v.optional(v.string()),
    renderId_remotion: v.optional(v.string()),
    bucketName: v.optional(v.string()),
    renderRegion: v.optional(v.string()),
  },
  handler: async (ctx, { renderId, renderId_remotion, ...patch }) => {
    await ctx.db.patch(renderId, {
      ...patch,
      ...(renderId_remotion ? { renderId: renderId_remotion } : {}),
    });
  },
});

export const attachResult = internalMutation({
  args: {
    renderId: v.id("videoRenders"),
    status: v.union(v.literal("succeeded"), v.literal("failed")),
    outputUrl: v.optional(v.string()),
    costUsd: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { renderId, status, ...patch }) => {
    await ctx.db.patch(renderId, {
      status,
      progress: status === "succeeded" ? 1 : undefined,
      progressLabel: undefined,
      ...patch,
    });
    // On success, point the project at its latest render for quick playback.
    if (status === "succeeded") {
      const r = await ctx.db.get(renderId);
      if (r) await ctx.db.patch(r.projectId, { lastRenderId: renderId });
    }
  },
});

// ── Queries ────────────────────────────────────────────────────────────────

/** Render jobs for a project, newest first (the editor's export history). */
export const listByProject = query({
  args: { projectId: v.id("videoProjects") },
  handler: async (ctx, { projectId }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(projectId), scope);
    return await ctx.db
      .query("videoRenders")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { id: v.id("videoRenders") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    return assertOrg(await ctx.db.get(id), scope);
  },
});

export const remove = mutation({
  args: { id: v.id("videoRenders") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    await ctx.db.delete(id);
  },
});
