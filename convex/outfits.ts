import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getScope, assertOrg } from "./lib/auth";
import { imageRef, outfitVariation } from "./schema";
import { resolveImages } from "./files";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const scope = await getScope(ctx);
    const rows = await ctx.db
      .query("outfits")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .order("desc")
      .collect();
    return Promise.all(
      rows
        .filter((r) => !r.archived)
        .map(async (r) => ({
          ...r,
          imageUrls: await resolveImages(ctx, r.images),
          variationCount: r.variations?.length ?? 0,
        })),
    );
  },
});

export const get = query({
  args: { id: v.id("outfits") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    const doc = assertOrg(await ctx.db.get(id), scope);
    return { ...doc, imageUrls: await resolveImages(ctx, doc.images) };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    promptDescriptor: v.optional(v.string()),
    images: v.optional(v.array(imageRef)),
    variations: v.optional(v.array(outfitVariation)),
  },
  handler: async (ctx, args) => {
    const scope = await getScope(ctx);
    return await ctx.db.insert("outfits", {
      orgId: scope.orgId,
      createdBy: scope.userId,
      ...args,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("outfits"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    promptDescriptor: v.optional(v.string()),
    images: v.optional(v.array(imageRef)),
    variations: v.optional(v.array(outfitVariation)),
  },
  handler: async (ctx, { id, ...patch }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    await ctx.db.patch(id, patch);
  },
});

export const addVariation = mutation({
  args: { id: v.id("outfits"), variation: outfitVariation },
  handler: async (ctx, { id, variation }) => {
    const scope = await getScope(ctx);
    const doc = assertOrg(await ctx.db.get(id), scope);
    await ctx.db.patch(id, {
      variations: [...(doc.variations ?? []), variation],
    });
  },
});

export const removeVariation = mutation({
  args: { id: v.id("outfits"), variationId: v.string() },
  handler: async (ctx, { id, variationId }) => {
    const scope = await getScope(ctx);
    const doc = assertOrg(await ctx.db.get(id), scope);
    await ctx.db.patch(id, {
      variations: (doc.variations ?? []).filter((x) => x.id !== variationId),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("outfits") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    await ctx.db.delete(id);
  },
});
