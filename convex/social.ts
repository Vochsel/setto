/**
 * Social posts (V8 runtime): the shared content calendar built from gallery
 * media. Composing/scheduling to Buffer happens in convex/socialNode.ts; here we
 * store, list, and manage the post records.
 *
 * Public tools: social:posts, social:saveDraft, social:remove.
 */
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { v } from "convex/values";
import { getScope, assertOrg } from "./lib/auth";

const mediaItem = v.object({
  type: v.string(),
  url: v.string(),
  thumbnailUrl: v.optional(v.string()),
});

/** The workspace's social posts, newest first. */
export const posts = query({
  args: {},
  handler: async (ctx) => {
    const scope = await getScope(ctx);
    const rows = await ctx.db
      .query("socialPosts")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .order("desc")
      .collect();
    return rows;
  },
});

/** Save a composed post as a draft (no external call). */
export const saveDraft = mutation({
  args: {
    text: v.string(),
    media: v.array(mediaItem),
    channelIds: v.optional(v.array(v.string())),
    scheduledAt: v.optional(v.number()),
    sourceGenerationIds: v.optional(v.array(v.string())),
    sourceVideoIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const scope = await getScope(ctx);
    const now = Date.now();
    return await ctx.db.insert("socialPosts", {
      orgId: scope.orgId,
      createdBy: scope.userId,
      provider: "buffer",
      text: args.text,
      media: args.media,
      channelIds: args.channelIds ?? [],
      scheduledAt: args.scheduledAt,
      status: "draft",
      sourceGenerationIds: args.sourceGenerationIds,
      sourceVideoIds: args.sourceVideoIds,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Edit a post's caption, schedule, channels, or status. */
export const update = mutation({
  args: {
    id: v.id("socialPosts"),
    text: v.optional(v.string()),
    channelIds: v.optional(v.array(v.string())),
    scheduledAt: v.optional(v.union(v.number(), v.null())),
    media: v.optional(v.array(mediaItem)),
  },
  handler: async (ctx, { id, scheduledAt, ...rest }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, val] of Object.entries(rest)) {
      if (val !== undefined) patch[k] = val;
    }
    if (scheduledAt !== undefined)
      patch.scheduledAt = scheduledAt ?? undefined;
    await ctx.db.patch(id, patch);
  },
});

/** Append media (e.g. another shoot image) to an existing post. */
export const addMedia = mutation({
  args: { id: v.id("socialPosts"), media: v.array(mediaItem) },
  handler: async (ctx, { id, media }) => {
    const scope = await getScope(ctx);
    const doc = assertOrg(await ctx.db.get(id), scope);
    // De-dupe by url so quick-adding the same image twice is a no-op.
    const seen = new Set(doc.media.map((m) => m.url));
    const merged = [...doc.media, ...media.filter((m) => !seen.has(m.url))];
    await ctx.db.patch(id, { media: merged, updatedAt: Date.now() });
  },
});

/** Delete a post record (does not unschedule on Buffer). */
export const remove = mutation({
  args: { id: v.id("socialPosts") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    await ctx.db.delete(id);
  },
});

// ── Internal helpers used by the scheduling node action ─────────────────────

export const create = internalMutation({
  args: {
    text: v.string(),
    media: v.array(mediaItem),
    channelIds: v.array(v.string()),
    scheduledAt: v.optional(v.number()),
    status: v.string(),
    sourceGenerationIds: v.optional(v.array(v.string())),
    sourceVideoIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const scope = await getScope(ctx);
    const now = Date.now();
    return await ctx.db.insert("socialPosts", {
      orgId: scope.orgId,
      createdBy: scope.userId,
      provider: "buffer",
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Load a post for the publish action (org-scoped). */
export const get = internalQuery({
  args: { id: v.id("socialPosts"), orgId: v.string() },
  handler: async (ctx, { id, orgId }) => {
    const doc = await ctx.db.get(id);
    if (!doc || doc.orgId !== orgId) return null;
    return doc;
  },
});

export const setResult = internalMutation({
  args: {
    id: v.id("socialPosts"),
    status: v.string(),
    externalIds: v.optional(v.array(v.string())),
    error: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { id, status, externalIds, error }) => {
    await ctx.db.patch(id, {
      status,
      externalIds,
      error: error ?? undefined,
      updatedAt: Date.now(),
    });
  },
});
