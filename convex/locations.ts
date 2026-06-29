import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
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
  },
  handler: async (ctx, { id, ...patch }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    await ctx.db.patch(id, patch);
  },
});

/**
 * Append reference images to a location without clobbering the existing set.
 * Used by the on-location photo capture in the shoot editor, where the client
 * doesn't hold the full current `images` array.
 */
export const addImages = mutation({
  args: { id: v.id("locations"), images: v.array(imageRef) },
  handler: async (ctx, { id, images }) => {
    const scope = await getScope(ctx);
    const doc = assertOrg(await ctx.db.get(id), scope);
    await ctx.db.patch(id, { images: [...(doc.images ?? []), ...images] });
  },
});

export const remove = mutation({
  args: { id: v.id("locations") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    await ctx.db.delete(id);
  },
});
