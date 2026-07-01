import {
  mutation,
  query,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { getScope, assertOrg, type Scope } from "./lib/auth";
import { videoClip, videoAudio } from "./schema";
import {
  buildSpec,
  getTemplate,
  getResolution,
  specDurationMs,
  defaultKenBurns,
  kenBurnsFromControls,
  DEFAULT_TEMPLATE_ID,
  type MediaInput,
  type VideoClip,
  type TransitionType,
} from "@setto/core/video";

// ── Helpers ───────────────────────────────────────────────────────────────

/** Resolve a generation image to a durable, playable URL. */
async function resolveGenerationUrl(
  ctx: QueryCtx,
  gen: Doc<"generations">,
): Promise<string | undefined> {
  if (gen.imageUrl) return gen.imageUrl;
  if (gen.storageId) return (await ctx.storage.getUrl(gen.storageId)) ?? undefined;
  return undefined;
}

/**
 * Pick the "best" succeeded generation for a shot to seed a clip from:
 * favorites first, then approved, then most recent.
 */
function pickBestGeneration(
  gens: Doc<"generations">[],
): Doc<"generations"> | undefined {
  const ok = gens.filter((g) => g.status === "succeeded");
  if (!ok.length) return undefined;
  const score = (g: Doc<"generations">) =>
    (g.favorite ? 2 : 0) + (g.reviewStatus === "approved" ? 1 : 0);
  return ok.sort(
    (a, b) => score(b) - score(a) || b._creationTime - a._creationTime,
  )[0];
}

function posterFromClips(clips: VideoClip[]): string | undefined {
  const first = clips[0];
  if (!first) return undefined;
  return first.sourceType === "video" ? (first.posterUrl ?? first.url) : first.url;
}

/** Insert a project from an already-built media list + template. */
async function insertProject(
  ctx: MutationCtx,
  scope: Scope,
  opts: {
    name: string;
    shootId?: Id<"shoots">;
    templateId: string;
    media: MediaInput[];
  },
): Promise<Id<"videoProjects">> {
  const spec = buildSpec(opts.media, opts.templateId);
  return ctx.db.insert("videoProjects", {
    orgId: scope.orgId,
    createdBy: scope.userId,
    name: opts.name,
    shootId: opts.shootId,
    templateId: spec.templateId,
    width: spec.width,
    height: spec.height,
    fps: spec.fps,
    background: spec.background,
    clips: spec.clips,
    posterUrl: posterFromClips(spec.clips),
  });
}

// ── Queries ────────────────────────────────────────────────────────────────

/** Shape a project doc into a list card (adds duration + clip count). */
function toCard(p: Doc<"videoProjects">) {
  return {
    _id: p._id,
    _creationTime: p._creationTime,
    name: p.name,
    shootId: p.shootId,
    templateId: p.templateId,
    width: p.width,
    height: p.height,
    fps: p.fps,
    clipCount: p.clips.length,
    durationMs: specDurationMs({
      templateId: p.templateId,
      width: p.width,
      height: p.height,
      fps: p.fps,
      clips: p.clips,
      audio: p.audio,
      stackStaggerMs: p.stackStaggerMs,
    }),
    posterUrl: p.posterUrl,
    favorite: p.favorite,
  };
}

/** All video projects for the workspace, newest first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const scope = await getScope(ctx);
    const rows = await ctx.db
      .query("videoProjects")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .order("desc")
      .collect();
    return rows.map(toCard);
  },
});

/** Video projects started from a given shoot. */
export const listByShoot = query({
  args: { shootId: v.id("shoots") },
  handler: async (ctx, { shootId }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(shootId), scope);
    const rows = await ctx.db
      .query("videoProjects")
      .withIndex("by_shoot", (q) => q.eq("shootId", shootId))
      .order("desc")
      .collect();
    return rows.map(toCard);
  },
});

/** A single project with its full editable spec. */
export const get = query({
  args: { id: v.id("videoProjects") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    const p = assertOrg(await ctx.db.get(id), scope);
    return p;
  },
});

// ── Create ───────────────────────────────────────────────────────────────

/** An empty project, ready for clips to be added in the editor. */
export const create = mutation({
  args: {
    name: v.optional(v.string()),
    templateId: v.optional(v.string()),
    shootId: v.optional(v.id("shoots")),
  },
  handler: async (ctx, args) => {
    const scope = await getScope(ctx);
    if (args.shootId) assertOrg(await ctx.db.get(args.shootId), scope);
    const id = await insertProject(ctx, scope, {
      name: args.name?.trim() || "Untitled video",
      shootId: args.shootId,
      templateId: args.templateId ?? DEFAULT_TEMPLATE_ID,
      media: [],
    });
    return { projectId: id };
  },
});

/**
 * Create a project from picked generation images (the main entry point from the
 * shots / gallery / model / wardrobe surfaces). Builds one clip per image in
 * the order given, using the template's defaults.
 */
export const createFromGenerations = mutation({
  args: {
    generationIds: v.array(v.id("generations")),
    templateId: v.optional(v.string()),
    name: v.optional(v.string()),
    shootId: v.optional(v.id("shoots")),
  },
  handler: async (ctx, args) => {
    const scope = await getScope(ctx);
    if (!args.generationIds.length) throw new Error("Pick at least one image");

    const media: MediaInput[] = [];
    let shootId = args.shootId;
    for (const gid of args.generationIds) {
      const gen = assertOrg(await ctx.db.get(gid), scope);
      const url = await resolveGenerationUrl(ctx, gen);
      if (!url) continue;
      shootId = shootId ?? gen.shootId;
      media.push({
        sourceType: "image",
        url,
        generationId: gen._id,
        shotId: gen.shotId,
      });
    }
    if (!media.length) throw new Error("None of the picked images are ready");

    const id = await insertProject(ctx, scope, {
      name: args.name?.trim() || "Untitled video",
      shootId,
      templateId: args.templateId ?? DEFAULT_TEMPLATE_ID,
      media,
    });
    return { projectId: id };
  },
});

/**
 * Create a project from whole shots — picks the best succeeded image per shot.
 * Lets the user start a video from a selection of shots without hand-picking
 * individual generations.
 */
export const createFromShots = mutation({
  args: {
    shotIds: v.array(v.id("shots")),
    templateId: v.optional(v.string()),
    name: v.optional(v.string()),
    shootId: v.optional(v.id("shoots")),
  },
  handler: async (ctx, args) => {
    const scope = await getScope(ctx);
    if (!args.shotIds.length) throw new Error("Pick at least one shot");

    const media: MediaInput[] = [];
    let shootId = args.shootId;
    for (const sid of args.shotIds) {
      const shot = assertOrg(await ctx.db.get(sid), scope);
      const gens = await ctx.db
        .query("generations")
        .withIndex("by_shot", (q) => q.eq("shotId", sid))
        .collect();
      const best = pickBestGeneration(gens);
      if (!best) continue;
      const url = await resolveGenerationUrl(ctx, best);
      if (!url) continue;
      shootId = shootId ?? shot.shootId;
      media.push({
        sourceType: "image",
        url,
        generationId: best._id,
        shotId: sid,
      });
    }
    if (!media.length) throw new Error("None of the picked shots have a finished image");

    const id = await insertProject(ctx, scope, {
      name: args.name?.trim() || "Untitled video",
      shootId,
      templateId: args.templateId ?? DEFAULT_TEMPLATE_ID,
      media,
    });
    return { projectId: id };
  },
});

/** Create a project from existing i2v video renders (real motion clips). */
export const createFromVideos = mutation({
  args: {
    videoIds: v.array(v.id("videos")),
    templateId: v.optional(v.string()),
    name: v.optional(v.string()),
    shootId: v.optional(v.id("shoots")),
  },
  handler: async (ctx, args) => {
    const scope = await getScope(ctx);
    if (!args.videoIds.length) throw new Error("Pick at least one video");

    const media: MediaInput[] = [];
    let shootId = args.shootId;
    for (const vid of args.videoIds) {
      const video = assertOrg(await ctx.db.get(vid), scope);
      if (video.status !== "succeeded" || !video.videoUrl) continue;
      shootId = shootId ?? video.shootId;
      media.push({
        sourceType: "video",
        url: video.videoUrl,
        posterUrl: video.posterUrl,
        durationMs: Math.round((video.durationSeconds ?? 5) * 1000),
        videoId: video._id,
        generationId: video.generationId,
        shotId: video.shotId,
      });
    }
    if (!media.length) throw new Error("None of the picked videos are ready");

    const id = await insertProject(ctx, scope, {
      name: args.name?.trim() || "Untitled video",
      shootId,
      templateId: args.templateId ?? "reel",
      media,
    });
    return { projectId: id };
  },
});

// ── Edit ───────────────────────────────────────────────────────────────────

/** Append more generation images as clips to an existing project. */
export const addGenerations = mutation({
  args: {
    projectId: v.id("videoProjects"),
    generationIds: v.array(v.id("generations")),
  },
  handler: async (ctx, { projectId, generationIds }) => {
    const scope = await getScope(ctx);
    const project = assertOrg(await ctx.db.get(projectId), scope);
    const template = getTemplate(project.templateId);

    const newClips: VideoClip[] = [];
    let layer = project.clips.length;
    for (const gid of generationIds) {
      const gen = assertOrg(await ctx.db.get(gid), scope);
      const url = await resolveGenerationUrl(ctx, gen);
      if (!url) continue;
      const built = buildSpec(
        [{ sourceType: "image", url, generationId: gen._id, shotId: gen.shotId }],
        template.id,
      ).clips[0];
      newClips.push({
        ...built,
        layer: template.kind === "stack" ? layer++ : undefined,
      });
    }
    const clips = [...project.clips, ...newClips];
    await ctx.db.patch(projectId, { clips, posterUrl: posterFromClips(clips) });
    return { added: newClips.length };
  },
});

/**
 * Replace the whole clip list — the workhorse for the editor's drag-to-reorder,
 * per-clip retime, effect/transition tweaks, and clip deletion. The client owns
 * the spec locally and persists the new ordered array.
 */
export const setClips = mutation({
  args: {
    projectId: v.id("videoProjects"),
    clips: v.array(videoClip),
  },
  handler: async (ctx, { projectId, clips }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(projectId), scope);
    await ctx.db.patch(projectId, {
      clips,
      posterUrl: posterFromClips(clips),
    });
  },
});

// ── Targeted clip ops (simple args — used by iOS and optimistic web edits) ──

/** Reorder clips to match the given id order (ids not present are dropped). */
export const reorderClips = mutation({
  args: { projectId: v.id("videoProjects"), clipIds: v.array(v.string()) },
  handler: async (ctx, { projectId, clipIds }) => {
    const scope = await getScope(ctx);
    const project = assertOrg(await ctx.db.get(projectId), scope);
    const byId = new Map(project.clips.map((c) => [c.id, c]));
    const clips = clipIds
      .map((id) => byId.get(id))
      .filter((c): c is VideoClip => !!c);
    if (clips.length !== project.clips.length) {
      throw new Error("Reorder must include every clip exactly once");
    }
    await ctx.db.patch(projectId, {
      clips,
      posterUrl: posterFromClips(clips),
    });
  },
});

/** Retime a single clip. */
export const setClipDuration = mutation({
  args: {
    projectId: v.id("videoProjects"),
    clipId: v.string(),
    durationMs: v.number(),
  },
  handler: async (ctx, { projectId, clipId, durationMs }) => {
    const scope = await getScope(ctx);
    const project = assertOrg(await ctx.db.get(projectId), scope);
    const clips = project.clips.map((c) =>
      c.id === clipId
        ? { ...c, durationMs: Math.max(200, Math.round(durationMs)) }
        : c,
    );
    await ctx.db.patch(projectId, { clips });
  },
});

/** Remove a single clip. */
export const removeClip = mutation({
  args: { projectId: v.id("videoProjects"), clipId: v.string() },
  handler: async (ctx, { projectId, clipId }) => {
    const scope = await getScope(ctx);
    const project = assertOrg(await ctx.db.get(projectId), scope);
    const clips = project.clips.filter((c) => c.id !== clipId);
    await ctx.db.patch(projectId, {
      clips,
      posterUrl: posterFromClips(clips),
    });
  },
});

/** Toggle the Ken Burns effect on an image clip. */
export const setClipKenBurns = mutation({
  args: {
    projectId: v.id("videoProjects"),
    clipId: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, { projectId, clipId, enabled }) => {
    const scope = await getScope(ctx);
    const project = assertOrg(await ctx.db.get(projectId), scope);
    const clips = project.clips.map((c, i) =>
      c.id === clipId && c.sourceType === "image"
        ? { ...c, effect: enabled ? defaultKenBurns(i) : { type: "none" as const } }
        : c,
    );
    await ctx.db.patch(projectId, { clips });
  },
});

/** Set a clip's incoming transition (simple args — used by iOS). */
export const setClipTransition = mutation({
  args: {
    projectId: v.id("videoProjects"),
    clipId: v.string(),
    type: v.union(
      v.literal("none"),
      v.literal("fade"),
      v.literal("dissolve"),
      v.literal("slide"),
      v.literal("wipe"),
    ),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, { projectId, clipId, type, durationMs }) => {
    const scope = await getScope(ctx);
    const project = assertOrg(await ctx.db.get(projectId), scope);
    const clips = project.clips.map((c) =>
      c.id === clipId
        ? {
            ...c,
            transition: {
              type: type as TransitionType,
              durationMs: type === "none" ? 0 : Math.max(0, durationMs ?? 400),
            },
          }
        : c,
    );
    await ctx.db.patch(projectId, { clips });
  },
});

/**
 * Set a full Ken Burns move on an image clip from friendly controls (direction
 * in/out + focal point + zoom). Simple args — the iOS clip inspector's motion
 * controls. (`setClipKenBurns` still exists for a plain on/off toggle.)
 */
export const setClipKenBurnsControls = mutation({
  args: {
    projectId: v.id("videoProjects"),
    clipId: v.string(),
    direction: v.union(v.literal("in"), v.literal("out")),
    focusX: v.number(),
    focusY: v.number(),
    zoom: v.number(),
  },
  handler: async (ctx, { projectId, clipId, direction, focusX, focusY, zoom }) => {
    const scope = await getScope(ctx);
    const project = assertOrg(await ctx.db.get(projectId), scope);
    const effect = kenBurnsFromControls({ direction, focusX, focusY, zoom });
    const clips = project.clips.map((c) =>
      c.id === clipId && c.sourceType === "image" ? { ...c, effect } : c,
    );
    await ctx.db.patch(projectId, { clips });
  },
});

/** Append existing i2v `videos` renders as motion clips (simple args — iOS). */
export const addVideos = mutation({
  args: {
    projectId: v.id("videoProjects"),
    videoIds: v.array(v.id("videos")),
  },
  handler: async (ctx, { projectId, videoIds }) => {
    const scope = await getScope(ctx);
    const project = assertOrg(await ctx.db.get(projectId), scope);
    const template = getTemplate(project.templateId);

    const media: MediaInput[] = [];
    for (const vid of videoIds) {
      const video = assertOrg(await ctx.db.get(vid), scope);
      if (video.status !== "succeeded" || !video.videoUrl) continue;
      media.push({
        sourceType: "video",
        url: video.videoUrl,
        posterUrl: video.posterUrl,
        durationMs: Math.round((video.durationSeconds ?? 5) * 1000),
        videoId: video._id,
        generationId: video.generationId,
        shotId: video.shotId,
      });
    }
    if (!media.length) return { added: 0 };

    const built = buildSpec(media, template.id).clips;
    let layer = project.clips.length;
    const newClips = built.map((c) => ({
      ...c,
      layer: template.kind === "stack" ? layer++ : undefined,
    }));
    const clips = [...project.clips, ...newClips];
    await ctx.db.patch(projectId, { clips, posterUrl: posterFromClips(clips) });
    return { added: newClips.length };
  },
});

/** Update composition-level settings (template, resolution, fps, audio, name). */
export const updateSettings = mutation({
  args: {
    projectId: v.id("videoProjects"),
    name: v.optional(v.string()),
    templateId: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    fps: v.optional(v.number()),
    background: v.optional(v.union(v.string(), v.null())),
    backgroundGradient: v.optional(v.union(v.string(), v.null())),
    backgroundImageUrl: v.optional(v.union(v.string(), v.null())),
    audio: v.optional(v.union(videoAudio, v.null())),
    stackStaggerMs: v.optional(v.number()),
    stackAnimate: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { projectId, audio, background, backgroundGradient, backgroundImageUrl, ...rest },
  ) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(projectId), scope);
    const patch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(rest)) {
      if (val !== undefined) patch[k] = val;
    }
    if (audio !== undefined) patch.audio = audio === null ? undefined : audio;
    // Nullable strings clear the field (undefined = "leave alone", null = clear).
    if (background !== undefined)
      patch.background = background === null ? undefined : background;
    if (backgroundGradient !== undefined)
      patch.backgroundGradient =
        backgroundGradient === null ? undefined : backgroundGradient;
    if (backgroundImageUrl !== undefined)
      patch.backgroundImageUrl =
        backgroundImageUrl === null ? undefined : backgroundImageUrl;
    await ctx.db.patch(projectId, patch);
  },
});

/** Apply a resolution preset by key. */
export const setResolution = mutation({
  args: { projectId: v.id("videoProjects"), resolutionKey: v.string() },
  handler: async (ctx, { projectId, resolutionKey }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(projectId), scope);
    const res = getResolution(resolutionKey);
    await ctx.db.patch(projectId, { width: res.width, height: res.height });
  },
});

export const rename = mutation({
  args: { projectId: v.id("videoProjects"), name: v.string() },
  handler: async (ctx, { projectId, name }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(projectId), scope);
    await ctx.db.patch(projectId, { name: name.trim() || "Untitled video" });
  },
});

export const remove = mutation({
  args: { id: v.id("videoProjects") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    // Clean up any render jobs for this project too.
    const renders = await ctx.db
      .query("videoRenders")
      .withIndex("by_project", (q) => q.eq("projectId", id))
      .collect();
    for (const r of renders) await ctx.db.delete(r._id);
    await ctx.db.delete(id);
  },
});
