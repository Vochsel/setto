/**
 * Review actions shared by every rateable media item — images (generations),
 * videos, and campaign creatives. One org-scoped surface (`review:setReview`,
 * `review:toggleFavorite`) over a union media id, so the web app, iOS, CLI and
 * MCP all drive the exact same thing.
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getScope, assertOrg } from "./lib/auth";
import { reviewStatusV } from "./schema";

/** Any rateable media id. */
const mediaId = v.union(
  v.id("generations"),
  v.id("videos"),
  v.id("campaignCreatives"),
);

type ReviewPatch = {
  rating?: number;
  reviewStatus?: "approved" | "rejected" | "needs_changes";
  favorite?: boolean;
};

function clampRating(n: number): number {
  return Math.max(1, Math.min(5, Math.round(n)));
}

/**
 * Set any of rating / reviewStatus / favorite on a media item. Pass `null` for
 * rating or reviewStatus to clear it; omit a field to leave it untouched.
 */
export const setReview = mutation({
  args: {
    id: mediaId,
    rating: v.optional(v.union(v.number(), v.null())),
    reviewStatus: v.optional(v.union(reviewStatusV, v.null())),
    favorite: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, rating, reviewStatus, favorite }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    const patch: ReviewPatch = {};
    if (rating !== undefined) {
      patch.rating = rating === null ? undefined : clampRating(rating);
    }
    if (reviewStatus !== undefined) {
      patch.reviewStatus = reviewStatus === null ? undefined : reviewStatus;
    }
    if (favorite !== undefined) patch.favorite = favorite;
    // The id is a union of three tables that all carry these fields; patch by
    // the concrete id at runtime.
    await ctx.db.patch(id as Id<"generations">, patch);
    return { ok: true };
  },
});

/** Flip the favorite flag and return the new value. */
export const toggleFavorite = mutation({
  args: { id: mediaId },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    const doc = assertOrg(await ctx.db.get(id), scope);
    const favorite = !doc.favorite;
    await ctx.db.patch(id as Id<"generations">, { favorite });
    return { favorite };
  },
});

/**
 * All favorited media for the workspace (succeeded images + videos), newest
 * first — a single feed the apps can render as a "Favorites" gallery.
 */
export const favorites = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const scope = await getScope(ctx);
    const [gens, vids] = await Promise.all([
      ctx.db
        .query("generations")
        .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
        .collect(),
      ctx.db
        .query("videos")
        .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
        .collect(),
    ]);

    const items: {
      kind: "image" | "video";
      _id: string;
      _creationTime: number;
      url: string;
      posterUrl?: string;
      rating?: number;
      reviewStatus?: "approved" | "rejected" | "needs_changes";
      favorite: boolean;
      modelLabel?: string;
      prompt?: string;
    }[] = [];

    for (const g of gens) {
      if (!g.favorite || g.status !== "succeeded") continue;
      let url = g.imageUrl;
      if (!url && g.storageId) {
        url = (await ctx.storage.getUrl(g.storageId)) ?? undefined;
      }
      if (!url) continue;
      items.push({
        kind: "image",
        _id: g._id,
        _creationTime: g._creationTime,
        url,
        rating: g.rating,
        reviewStatus: g.reviewStatus,
        favorite: true,
        modelLabel: g.modelLabel,
        prompt: g.prompt,
      });
    }
    for (const vd of vids) {
      if (!vd.favorite || vd.status !== "succeeded" || !vd.videoUrl) continue;
      items.push({
        kind: "video",
        _id: vd._id,
        _creationTime: vd._creationTime,
        url: vd.videoUrl,
        posterUrl: vd.posterUrl,
        rating: vd.rating,
        reviewStatus: vd.reviewStatus,
        favorite: true,
        modelLabel: vd.modelLabel,
        prompt: vd.prompt,
      });
    }

    items.sort((a, b) => b._creationTime - a._creationTime);
    return limit ? items.slice(0, limit) : items;
  },
});

/** A unified media item — the row the swipe feed / gallery renders. */
type FeedItem = {
  kind: "image" | "video";
  _id: string;
  _creationTime: number;
  url: string;
  posterUrl?: string;
  rating?: number;
  reviewStatus?: "approved" | "rejected" | "needs_changes";
  favorite: boolean;
  modelLabel?: string;
  prompt?: string;
  modelId?: string;
  shootId?: string;
};

/**
 * One feed of every succeeded image + video, newest first — the data behind the
 * TikTok-style swipe view in the apps. Optionally narrow to a single shoot, to
 * favorites only, or to one media kind. Mirrors `favorites` but without forcing
 * the favorite filter, and carries `modelId` / `shootId` so clients can filter
 * locally.
 */
export const feed = query({
  args: {
    shootId: v.optional(v.id("shoots")),
    modelId: v.optional(v.id("models")),
    favoritesOnly: v.optional(v.boolean()),
    kind: v.optional(v.union(v.literal("image"), v.literal("video"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { shootId, modelId, favoritesOnly, kind, limit }) => {
    const scope = await getScope(ctx);
    // When scoped to a shoot, the by_shoot index isn't org-bounded — assert the
    // shoot belongs to the caller before reading its media.
    if (shootId) assertOrg(await ctx.db.get(shootId), scope);

    const gens = shootId
      ? await ctx.db
          .query("generations")
          .withIndex("by_shoot", (q) => q.eq("shootId", shootId))
          .collect()
      : await ctx.db
          .query("generations")
          .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
          .collect();
    const vids = shootId
      ? await ctx.db
          .query("videos")
          .withIndex("by_shoot", (q) => q.eq("shootId", shootId))
          .collect()
      : await ctx.db
          .query("videos")
          .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
          .collect();

    const items: FeedItem[] = [];

    if (kind !== "video") {
      for (const g of gens) {
        if (g.status !== "succeeded") continue;
        if (favoritesOnly && !g.favorite) continue;
        let url = g.imageUrl;
        if (!url && g.storageId) {
          url = (await ctx.storage.getUrl(g.storageId)) ?? undefined;
        }
        if (!url) continue;
        items.push({
          kind: "image",
          _id: g._id,
          _creationTime: g._creationTime,
          url,
          rating: g.rating,
          reviewStatus: g.reviewStatus,
          favorite: g.favorite ?? false,
          modelLabel: g.modelLabel,
          prompt: g.prompt,
          modelId: g.modelId,
          shootId: g.shootId,
        });
      }
    }
    if (kind !== "image") {
      for (const vd of vids) {
        if (vd.status !== "succeeded" || !vd.videoUrl) continue;
        if (favoritesOnly && !vd.favorite) continue;
        items.push({
          kind: "video",
          _id: vd._id,
          _creationTime: vd._creationTime,
          url: vd.videoUrl,
          posterUrl: vd.posterUrl,
          rating: vd.rating,
          reviewStatus: vd.reviewStatus,
          favorite: vd.favorite ?? false,
          modelLabel: vd.modelLabel,
          prompt: vd.prompt,
          modelId: vd.modelId,
          shootId: vd.shootId,
        });
      }
    }

    const filtered = modelId
      ? items.filter((it) => it.modelId === modelId)
      : items;
    filtered.sort((a, b) => b._creationTime - a._creationTime);
    return limit ? filtered.slice(0, limit) : filtered;
  },
});
