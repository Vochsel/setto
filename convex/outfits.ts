import { mutation, query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { getScope, assertOrg } from "./lib/auth";
import { imageRef, outfitVariation } from "./schema";
import { resolveImages } from "./files";

/** Resolve display URLs for each embedded variation's images. */
async function resolveVariations(
  ctx: QueryCtx,
  variations: Doc<"outfits">["variations"],
) {
  return Promise.all(
    (variations ?? []).map(async (vrt) => ({
      ...vrt,
      imageUrls: await resolveImages(ctx, vrt.images),
    })),
  );
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const scope = await getScope(ctx);
    const [rows, cats] = await Promise.all([
      ctx.db
        .query("outfits")
        .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
        .order("desc")
        .collect(),
      ctx.db
        .query("outfitCategories")
        .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
        .collect(),
    ]);
    const catName = new Map(cats.map((c) => [c._id, c.name]));
    return Promise.all(
      rows
        .filter((r) => !r.archived)
        .map(async (r) => ({
          ...r,
          imageUrls: await resolveImages(ctx, r.images),
          variations: await resolveVariations(ctx, r.variations),
          variationCount: r.variations?.length ?? 0,
          // Display name from the editable taxonomy, falling back to legacy text.
          categoryName:
            (r.categoryId ? catName.get(r.categoryId) : undefined) ??
            r.category,
        })),
    );
  },
});

export const get = query({
  args: { id: v.id("outfits") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    const doc = assertOrg(await ctx.db.get(id), scope);
    const cat = doc.categoryId ? await ctx.db.get(doc.categoryId) : null;
    return {
      ...doc,
      imageUrls: await resolveImages(ctx, doc.images),
      variations: await resolveVariations(ctx, doc.variations),
      categoryName: cat?.name ?? doc.category,
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    categoryId: v.optional(v.id("outfitCategories")),
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
    // null clears the category; undefined leaves it unchanged.
    categoryId: v.optional(v.union(v.id("outfitCategories"), v.null())),
    promptDescriptor: v.optional(v.string()),
    images: v.optional(v.array(imageRef)),
    variations: v.optional(v.array(outfitVariation)),
  },
  handler: async (ctx, { id, categoryId, ...patch }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    await ctx.db.patch(id, {
      ...patch,
      ...(categoryId !== undefined
        ? { categoryId: categoryId ?? undefined }
        : {}),
    });
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
