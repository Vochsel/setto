import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getScope, assertOrg } from "./lib/auth";
import { imageRef } from "./schema";
import { resolveImages } from "./files";

/**
 * Pick the headshot + sheet display URLs from a model's images. A model holds at
 * most two images, tagged by `source`. Legacy models (pre headshot/sheet split)
 * fall back: a "sheet"-tagged image is the sheet, and the first non-sheet image
 * is treated as the headshot.
 */
function pickHeadshotSheet(
  images: Array<{ source?: string }> | undefined,
  imageUrls: { url: string }[],
): { headshotUrl?: string; sheetUrl?: string } {
  const withUrl = (images ?? []).map((im, i) => ({
    source: im.source,
    url: imageUrls[i]?.url,
  }));
  const sheet = withUrl.find((i) => i.source === "sheet");
  const headshot =
    withUrl.find((i) => i.source === "headshot") ??
    withUrl.find((i) => i !== sheet);
  return { headshotUrl: headshot?.url, sheetUrl: sheet?.url };
}

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
        .map(async (r) => {
          const imageUrls = await resolveImages(ctx, r.images);
          return { ...r, imageUrls, ...pickHeadshotSheet(r.images, imageUrls) };
        }),
    );
  },
});

export const get = query({
  args: { id: v.id("models") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    const doc = assertOrg(await ctx.db.get(id), scope);
    const imageUrls = await resolveImages(ctx, doc.images);
    return { ...doc, imageUrls, ...pickHeadshotSheet(doc.images, imageUrls) };
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

/** Set/replace a model's sheet image while preserving its headshot. Internal —
 * called by the standardize background job. A legacy non-sheet image is promoted
 * to the headshot so the model ends up with exactly [headshot, sheet]. */
export const setSheet = internalMutation({
  args: { id: v.id("models"), image: imageRef },
  handler: async (ctx, { id, image }) => {
    const doc = await ctx.db.get(id);
    if (!doc) return;
    const imgs = doc.images ?? [];
    const explicitHeadshot = imgs.find((i) => i.source === "headshot");
    const legacy = imgs.find((i) => i.source !== "sheet");
    const headshot = explicitHeadshot
      ? explicitHeadshot
      : legacy
        ? { ...legacy, source: "headshot" }
        : undefined;
    const images = [
      ...(headshot ? [headshot] : []),
      { ...image, source: "sheet" },
    ];
    await ctx.db.patch(id, { images });
  },
});
