import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getScope, assertOrg } from "./lib/auth";
import { imageRef } from "./schema";
import { resolveImages } from "./files";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const scope = await getScope(ctx);
    const rows = await ctx.db
      .query("models")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .order("desc")
      .collect();
    return Promise.all(
      rows
        .filter((r) => !r.archived)
        .map(async (r) => ({
          ...r,
          imageUrls: await resolveImages(ctx, r.images),
        })),
    );
  },
});

export const get = query({
  args: { id: v.id("models") },
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
    promptDescriptor: v.optional(v.string()),
    attributes: v.optional(v.any()),
    images: v.optional(v.array(imageRef)),
  },
  handler: async (ctx, args) => {
    const scope = await getScope(ctx);
    return await ctx.db.insert("models", {
      orgId: scope.orgId,
      createdBy: scope.userId,
      ...args,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("models"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    promptDescriptor: v.optional(v.string()),
    attributes: v.optional(v.any()),
    images: v.optional(v.array(imageRef)),
  },
  handler: async (ctx, { id, ...patch }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("models") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    await ctx.db.delete(id);
  },
});

/** Append a generated image to a model. Internal — called by background jobs. */
export const appendImage = internalMutation({
  args: { id: v.id("models"), image: imageRef },
  handler: async (ctx, { id, image }) => {
    const doc = await ctx.db.get(id);
    if (!doc) return;
    await ctx.db.patch(id, { images: [...(doc.images ?? []), image] });
  },
});
