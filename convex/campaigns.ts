import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { getScope, assertOrg } from "./lib/auth";
import { imageRef, adCopy, copyVariant, campaignShotRef } from "./schema";
import { resolveImages } from "./files";

const statusValidator = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("archived"),
);

/** Resolve a generation id to a display URL (or null if gone / unfinished). */
async function resolveGenerationUrl(
  ctx: QueryCtx,
  gen: Doc<"generations"> | null,
): Promise<string | null> {
  if (!gen || gen.status !== "succeeded") return null;
  let url = gen.imageUrl;
  if (!url && gen.storageId) {
    url = (await ctx.storage.getUrl(gen.storageId)) ?? undefined;
  }
  return url ?? null;
}

/** Resolve a campaign's picked shots into displayable thumbnails. */
async function resolveSelectedShots(
  ctx: QueryCtx,
  selected: Doc<"campaigns">["selectedShots"],
) {
  const out: { generationId: string; shootId?: string; url: string }[] = [];
  for (const s of selected ?? []) {
    const gen = await ctx.db.get(s.generationId);
    const url = await resolveGenerationUrl(ctx, gen);
    if (url) out.push({ generationId: s.generationId, shootId: s.shootId, url });
  }
  return out;
}

export const list = query({
  args: { status: v.optional(statusValidator) },
  handler: async (ctx, { status }) => {
    const scope = await getScope(ctx);
    const rows = status
      ? await ctx.db
          .query("campaigns")
          .withIndex("by_org_status", (q) =>
            q.eq("orgId", scope.orgId).eq("status", status),
          )
          .order("desc")
          .collect()
      : await ctx.db
          .query("campaigns")
          .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
          .order("desc")
          .collect();

    // Attach light info for the cards: counts + a few finished creatives.
    return Promise.all(
      rows.map(async (c) => {
        const creatives = await ctx.db
          .query("campaignCreatives")
          .withIndex("by_campaign", (q) => q.eq("campaignId", c._id))
          .order("desc")
          .collect();
        const recentImages: string[] = [];
        for (const g of creatives) {
          const url = await resolveGenerationUrl(
            ctx,
            g as unknown as Doc<"generations">,
          );
          if (url) recentImages.push(url);
          if (recentImages.length >= 5) break;
        }
        return {
          ...c,
          shotCount: c.selectedShots?.length ?? 0,
          creativeCount: creatives.length,
          recentImages,
        };
      }),
    );
  },
});

export const get = query({
  args: { id: v.id("campaigns") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    const doc = assertOrg(await ctx.db.get(id), scope);
    return {
      ...doc,
      inspirationUrls: await resolveImages(ctx, doc.inspirationRefs),
      selectedShotImages: await resolveSelectedShots(ctx, doc.selectedShots),
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    brief: v.optional(v.string()),
    aspectRatio: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scope = await getScope(ctx);
    return await ctx.db.insert("campaigns", {
      orgId: scope.orgId,
      createdBy: scope.userId,
      status: "draft",
      aspectRatio: args.aspectRatio ?? "4:5",
      ...args,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("campaigns"),
    name: v.optional(v.string()),
    brief: v.optional(v.string()),
    status: v.optional(statusValidator),
    copy: v.optional(adCopy),
    aspectRatio: v.optional(v.string()),
    inspirationRefs: v.optional(v.array(imageRef)),
    selectedShots: v.optional(v.array(campaignShotRef)),
    coverImage: v.optional(imageRef),
  },
  handler: async (ctx, { id, ...patch }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    await ctx.db.patch(id, patch);
  },
});

/** Toggle a shot (generation) into / out of the campaign's selected set. */
export const toggleShot = mutation({
  args: {
    id: v.id("campaigns"),
    generationId: v.id("generations"),
    shootId: v.optional(v.id("shoots")),
  },
  handler: async (ctx, { id, generationId, shootId }) => {
    const scope = await getScope(ctx);
    const doc = assertOrg(await ctx.db.get(id), scope);
    const current = doc.selectedShots ?? [];
    const exists = current.some((s) => s.generationId === generationId);
    const next = exists
      ? current.filter((s) => s.generationId !== generationId)
      : [...current, { generationId, shootId }];
    await ctx.db.patch(id, { selectedShots: next });
  },
});

/** Replace the working ad copy (used when applying a generated variant). */
export const setCopy = mutation({
  args: { id: v.id("campaigns"), copy: adCopy },
  handler: async (ctx, { id, copy }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    await ctx.db.patch(id, { copy });
  },
});

export const remove = mutation({
  args: { id: v.id("campaigns") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    // Cascade: campaign creatives.
    const creatives = await ctx.db
      .query("campaignCreatives")
      .withIndex("by_campaign", (q) => q.eq("campaignId", id))
      .collect();
    for (const g of creatives) await ctx.db.delete(g._id);
    await ctx.db.delete(id);
  },
});

/* ─────────────────────────── internal (actions) ─────────────────────────── */

/** Persist GPT-generated copy suggestions (called by the copy action). */
export const saveCopyVariants = internalMutation({
  args: {
    id: v.id("campaigns"),
    variants: v.array(copyVariant),
  },
  handler: async (ctx, { id, variants }) => {
    const c = await ctx.db.get(id);
    if (!c) return;
    await ctx.db.patch(id, { copyVariants: variants });
  },
});

/** Everything the creative-generation action needs to build its prompt. */
export const creativeContext = internalQuery({
  args: { id: v.id("campaigns") },
  handler: async (ctx, { id }) => {
    const c = await ctx.db.get(id);
    if (!c) throw new Error("Campaign not found");
    return {
      orgId: c.orgId,
      name: c.name,
      brief: c.brief ?? null,
      copy: c.copy ?? null,
      aspectRatio: c.aspectRatio ?? null,
      inspirationUrls: (await resolveImages(ctx, c.inspirationRefs)).map(
        (i) => i.url,
      ),
      shotUrls: (await resolveSelectedShots(ctx, c.selectedShots)).map(
        (s) => s.url,
      ),
    };
  },
});
