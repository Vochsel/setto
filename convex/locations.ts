import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { getScope, assertOrg } from "./lib/auth";
import { imageRef } from "./schema";
import { resolveImages } from "./files";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const scope = await getScope(ctx);
    const rows = await ctx.db
      .query("locations")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .order("desc")
      .collect();
    return Promise.all(
      rows
        .filter((r) => !r.archived)
        .map(async (r) => ({
          ...r,
          imageUrls: await resolveImages(ctx, r.images),
          streetViewUrls: await resolveImages(ctx, r.streetViewRefs),
        })),
    );
  },
});

export const get = query({
  args: { id: v.id("locations") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    const doc = assertOrg(await ctx.db.get(id), scope);
    return {
      ...doc,
      imageUrls: await resolveImages(ctx, doc.images),
      streetViewUrls: await resolveImages(ctx, doc.streetViewRefs),
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    promptDescriptor: v.optional(v.string()),
    address: v.optional(v.string()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    googlePlaceId: v.optional(v.string()),
    images: v.optional(v.array(imageRef)),
    streetViewRefs: v.optional(v.array(imageRef)),
    streetViewRadiusEnabled: v.optional(v.boolean()),
    streetViewRadiusMeters: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const scope = await getScope(ctx);
    return await ctx.db.insert("locations", {
      orgId: scope.orgId,
      createdBy: scope.userId,
      ...args,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("locations"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    promptDescriptor: v.optional(v.string()),
    address: v.optional(v.string()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    googlePlaceId: v.optional(v.string()),
    images: v.optional(v.array(imageRef)),
    streetViewRefs: v.optional(v.array(imageRef)),
    streetViewRadiusEnabled: v.optional(v.boolean()),
    streetViewRadiusMeters: v.optional(v.number()),
  },
  handler: async (ctx, { id, ...patch }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("locations") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    // Drop the location's candidate backdrops too, so they don't dangle.
    const backdrops = await ctx.db
      .query("locationBackdrops")
      .withIndex("by_location", (q) => q.eq("locationId", id))
      .collect();
    for (const b of backdrops) await ctx.db.delete(b._id);
    await ctx.db.delete(id);
  },
});

// ── Prompted location backdrops ────────────────────────────────────────────
// Candidate backdrop images generated from a text prompt. See the
// `locationBackdrops` schema note and `convex/generate.ts` (generateBackdrops).

/** Candidate backdrops for a location (every status), newest first, streaming. */
export const listBackdrops = query({
  args: { locationId: v.id("locations") },
  handler: async (ctx, { locationId }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(locationId), scope);
    const rows = await ctx.db
      .query("locationBackdrops")
      .withIndex("by_location", (q) => q.eq("locationId", locationId))
      .order("desc")
      .collect();
    return Promise.all(
      rows.map(async (b) => {
        let imageUrl = b.imageUrl;
        if (!imageUrl && b.storageId) {
          imageUrl = (await ctx.storage.getUrl(b.storageId)) ?? undefined;
        }
        let thumbUrl = b.thumbnailUrl ?? imageUrl;
        if (!thumbUrl && b.thumbStorageId) {
          thumbUrl = (await ctx.storage.getUrl(b.thumbStorageId)) ?? undefined;
        }
        return {
          _id: b._id,
          _creationTime: b._creationTime,
          status: b.status,
          progress: b.progress,
          progressLabel: b.progressLabel,
          imageUrl,
          thumbUrl,
          kept: b.kept ?? false,
          userPrompt: b.userPrompt,
          error: b.error,
        };
      }),
    );
  },
});

/** Build the reference `imageRef` for a finished backdrop (R2 → url, else storage id). */
function backdropRef(b: Doc<"locationBackdrops">) {
  return b.storageId
    ? { storageId: b.storageId, source: "generated", caption: b.userPrompt }
    : { url: b.imageUrl, source: "generated", caption: b.userPrompt };
}

/** True when an existing location image points at the same file as this backdrop. */
function sameImage(img: { storageId?: string; url?: string }, b: Doc<"locationBackdrops">) {
  if (b.storageId && img.storageId === b.storageId) return true;
  if (b.imageUrl && img.url === b.imageUrl) return true;
  return false;
}

export const createBackdrop = internalMutation({
  args: {
    orgId: v.string(),
    createdBy: v.string(),
    locationId: v.id("locations"),
    userPrompt: v.optional(v.string()),
    prompt: v.string(),
    interior: v.optional(v.boolean()),
    provider: v.string(),
    modelKey: v.string(),
    modelLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("locationBackdrops", {
      ...args,
      status: "queued",
    });
  },
});

export const setBackdropProgress = internalMutation({
  args: {
    id: v.id("locationBackdrops"),
    status: v.optional(
      v.union(
        v.literal("queued"),
        v.literal("generating"),
        v.literal("succeeded"),
        v.literal("failed"),
      ),
    ),
    progress: v.optional(v.number()),
    progressLabel: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...patch }) => {
    await ctx.db.patch(id, patch);
  },
});

export const attachBackdropResult = internalMutation({
  args: {
    id: v.id("locationBackdrops"),
    status: v.union(v.literal("succeeded"), v.literal("failed")),
    imageUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    thumbnailUrl: v.optional(v.string()),
    thumbStorageId: v.optional(v.id("_storage")),
    seed: v.optional(v.number()),
    falRequestId: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...patch }) => {
    await ctx.db.patch(id, { progressLabel: undefined, ...patch });
  },
});

/** Keep a finished candidate: copy it into the location's reference images. */
export const keepBackdrop = mutation({
  args: { id: v.id("locationBackdrops") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    const b = assertOrg(await ctx.db.get(id), scope);
    if (b.status !== "succeeded" || (!b.imageUrl && !b.storageId)) {
      throw new Error("This backdrop isn't ready yet");
    }
    const loc = assertOrg(await ctx.db.get(b.locationId), scope);
    const images = loc.images ?? [];
    if (!images.some((img) => sameImage(img, b))) {
      await ctx.db.patch(loc._id, { images: [...images, backdropRef(b)] });
    }
    await ctx.db.patch(id, { kept: true });
  },
});

/** Unkeep a candidate: remove it from the location's reference images. */
export const unkeepBackdrop = mutation({
  args: { id: v.id("locationBackdrops") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    const b = assertOrg(await ctx.db.get(id), scope);
    const loc = assertOrg(await ctx.db.get(b.locationId), scope);
    await ctx.db.patch(loc._id, {
      images: (loc.images ?? []).filter((img) => !sameImage(img, b)),
    });
    await ctx.db.patch(id, { kept: false });
  },
});

/** Delete a candidate backdrop (removing it from the location refs if kept). */
export const removeBackdrop = mutation({
  args: { id: v.id("locationBackdrops") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    const b = assertOrg(await ctx.db.get(id), scope);
    if (b.kept) {
      const loc = await ctx.db.get(b.locationId);
      if (loc && loc.orgId === scope.orgId) {
        await ctx.db.patch(loc._id, {
          images: (loc.images ?? []).filter((img) => !sameImage(img, b)),
        });
      }
    }
    // Free a Convex-stored file (R2-hosted urls are shared/durable — leave them).
    if (b.storageId) {
      try {
        await ctx.storage.delete(b.storageId);
      } catch {
        /* already gone */
      }
    }
    await ctx.db.delete(id);
  },
});
