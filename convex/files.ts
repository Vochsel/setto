import { mutation, query } from "./_generated/server";
import { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { getScope } from "./lib/auth";

export type StoredImage = {
  storageId?: string;
  url?: string;
  caption?: string;
  source?: string;
};

/** Generate a short-lived URL the client can POST a file to. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await getScope(ctx); // must be authed
    return await ctx.storage.generateUploadUrl();
  },
});

/** Resolve a stored file (e.g. an uploaded audio track) to a playable URL. */
export const getUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    await getScope(ctx); // must be authed
    return await ctx.storage.getUrl(storageId);
  },
});

/** Resolve an array of image refs into displayable URLs. */
export async function resolveImages(
  ctx: QueryCtx,
  images: StoredImage[] | undefined,
): Promise<{ url: string; caption?: string; source?: string }[]> {
  if (!images?.length) return [];
  const out: { url: string; caption?: string; source?: string }[] = [];
  for (const img of images) {
    let url = img.url;
    if (img.storageId) {
      const resolved = await ctx.storage.getUrl(img.storageId as never);
      if (resolved) url = resolved;
    }
    if (url) out.push({ url, caption: img.caption, source: img.source });
  }
  return out;
}
