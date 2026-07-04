"use node";
/**
 * Social scheduling (node runtime): list the user's Buffer channels and publish
 * a composed post (image/video + caption) to them, optionally scheduled.
 *
 * A post record is created up front, then we call Buffer once per channel and
 * record the outcome, so a partial failure is visible per post. Buffer's GraphQL
 * schema is the one path still to confirm against a live token (see
 * lib/providerClients.ts) — failures surface as the post's `error`.
 *
 * Public tools: socialNode:channels, socialNode:schedule.
 */
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { loadConnection, markUsed } from "./lib/connection";
import {
  bufferChannels,
  bufferCreatePost,
  type BufferAsset,
} from "./lib/providerClients";

interface PostMedia {
  type: string;
  url: string;
  thumbnailUrl?: string;
}

/** Push a set of media + caption to Buffer channels. Returns the Buffer ids. */
async function pushToBuffer(
  secret: string,
  meta: Record<string, unknown>,
  post: {
    text: string;
    media: PostMedia[];
    channelIds: string[];
    scheduledAt?: number;
  },
): Promise<string[]> {
  const assets: BufferAsset[] = post.media.map((m) =>
    m.type === "video"
      ? { video: { url: m.url, thumbnailUrl: m.thumbnailUrl } }
      : { image: { url: m.url, thumbnailUrl: m.thumbnailUrl } },
  );
  const dueAt = post.scheduledAt
    ? new Date(post.scheduledAt).toISOString()
    : undefined;
  const ids: string[] = [];
  for (const channelId of post.channelIds) {
    const res = await bufferCreatePost(secret, meta, {
      channelId,
      text: post.text,
      assets,
      dueAt,
    });
    if (res.id) ids.push(res.id);
  }
  return ids;
}

/** List the connected Buffer channels (for the composer's channel picker). */
export const channels = action({
  args: {},
  handler: async (ctx) => {
    const { scope, secret, meta } = await loadConnection(ctx, "buffer");
    const list = await bufferChannels(secret, meta);
    await markUsed(ctx, scope, "buffer");
    return list;
  },
});

export interface ScheduleResult {
  postId: Id<"socialPosts">;
  ok: boolean;
  externalIds: string[];
  error?: string;
}

/** Compose + publish/schedule a post to one or more Buffer channels. */
export const schedule = action({
  args: {
    text: v.string(),
    media: v.array(
      v.object({
        type: v.string(),
        url: v.string(),
        thumbnailUrl: v.optional(v.string()),
      }),
    ),
    channelIds: v.array(v.string()),
    scheduledAt: v.optional(v.number()), // epoch ms; omit to publish to queue now
    sourceGenerationIds: v.optional(v.array(v.string())),
    sourceVideoIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<ScheduleResult> => {
    if (!args.channelIds.length) throw new Error("Pick at least one channel");
    const { scope, secret, meta } = await loadConnection(ctx, "buffer");

    const postId: Id<"socialPosts"> = await ctx.runMutation(
      internal.social.create,
      {
        text: args.text,
        media: args.media,
        channelIds: args.channelIds,
        scheduledAt: args.scheduledAt,
        status: "scheduled",
        sourceGenerationIds: args.sourceGenerationIds,
        sourceVideoIds: args.sourceVideoIds,
      },
    );

    try {
      const externalIds = await pushToBuffer(secret, meta, args);
      await ctx.runMutation(internal.social.setResult, {
        id: postId,
        status: "sent",
        externalIds,
        error: null,
      });
      await markUsed(ctx, scope, "buffer");
      return { postId, ok: true, externalIds };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.social.setResult, {
        id: postId,
        status: "error",
        externalIds: [],
        error,
      });
      return { postId, ok: false, externalIds: [], error };
    }
  },
});

/** Publish an already-composed post (e.g. one planned on the calendar). */
export const publish = action({
  args: { id: v.id("socialPosts") },
  handler: async (ctx, { id }): Promise<ScheduleResult> => {
    const { scope, secret, meta } = await loadConnection(ctx, "buffer");
    const post = await ctx.runQuery(internal.social.get, {
      id,
      orgId: scope.orgId,
    });
    if (!post) throw new Error("Post not found");
    if (!post.channelIds.length) throw new Error("Pick at least one channel");
    try {
      const externalIds = await pushToBuffer(secret, meta, {
        text: post.text,
        media: post.media,
        channelIds: post.channelIds,
        scheduledAt: post.scheduledAt,
      });
      await ctx.runMutation(internal.social.setResult, {
        id,
        status: "sent",
        externalIds,
        error: null,
      });
      await markUsed(ctx, scope, "buffer");
      return { postId: id, ok: true, externalIds };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.social.setResult, {
        id,
        status: "error",
        externalIds: [],
        error,
      });
      return { postId: id, ok: false, externalIds: [], error };
    }
  },
});
