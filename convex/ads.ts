import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { getScope, assertOrg } from "./lib/auth";
import { getTextModel, DEFAULT_TEXT_MODEL_ID } from "./lib/textModels";
import { chatText } from "./lib/openai";
import { adSlot, adCopy } from "./schema";
import {
  LAYOUT_SYSTEM,
  buildLayoutUser,
  parseSlots,
  sanitizeHtml,
} from "./lib/adLayout";

const slotKind = v.union(v.literal("image"), v.literal("video"));

type Slot = NonNullable<Doc<"campaignAds">["slots"]>[number];

/**
 * Re-resolve a slot's media URL from its bound source so storage-backed URLs
 * stay fresh (the stored mediaUrl is only a fallback). Verifies the source
 * belongs to the same org.
 */
async function resolveSlotMedia(
  ctx: QueryCtx,
  orgId: string,
  slot: Slot,
): Promise<Slot> {
  const sid = slot.sourceId;
  if (sid && slot.source === "shot") {
    const id = ctx.db.normalizeId("generations", sid);
    const g = id ? await ctx.db.get(id) : null;
    if (g && g.orgId === orgId && g.status === "succeeded") {
      let url = g.imageUrl;
      if (!url && g.storageId)
        url = (await ctx.storage.getUrl(g.storageId)) ?? undefined;
      return { ...slot, kind: "image", mediaUrl: url, posterUrl: undefined };
    }
  } else if (sid && slot.source === "creative") {
    const id = ctx.db.normalizeId("campaignCreatives", sid);
    const c = id ? await ctx.db.get(id) : null;
    if (c && c.orgId === orgId) {
      let url = c.imageUrl;
      if (!url && c.storageId)
        url = (await ctx.storage.getUrl(c.storageId)) ?? undefined;
      return { ...slot, kind: "image", mediaUrl: url, posterUrl: undefined };
    }
  } else if (sid && slot.source === "video") {
    const id = ctx.db.normalizeId("videos", sid);
    const vd = id ? await ctx.db.get(id) : null;
    if (vd && vd.orgId === orgId) {
      return {
        ...slot,
        kind: "video",
        mediaUrl: vd.videoUrl,
        posterUrl: vd.posterUrl,
      };
    }
  }
  return slot;
}

/** List the composed ads for a campaign, with each slot's media resolved. */
export const listByCampaign = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, { campaignId }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(campaignId), scope);
    const rows = await ctx.db
      .query("campaignAds")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .order("desc")
      .collect();
    return Promise.all(
      rows.map(async (r) => ({
        ...r,
        slots: await Promise.all(
          (r.slots ?? []).map((s) => resolveSlotMedia(ctx, scope.orgId, s)),
        ),
      })),
    );
  },
});

/* ─────────────────────────── generation ─────────────────────────── */

/** Create an ad row in `generating` state and kick off the layout worker. */
export const generateAdLayout = action({
  args: {
    campaignId: v.id("campaigns"),
    instructions: v.optional(v.string()),
    modelKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ adId: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const userId = identity.subject;
    const orgId = (identity.org_id as string | undefined) ?? `user:${userId}`;

    const c = await ctx.runQuery(internal.campaigns.adContext, {
      id: args.campaignId,
    });
    if (c.orgId !== orgId) throw new Error("Not found");

    const model =
      getTextModel(args.modelKey ?? DEFAULT_TEXT_MODEL_ID) ??
      getTextModel(DEFAULT_TEXT_MODEL_ID)!;

    const adId = await ctx.runMutation(internal.ads.createAd, {
      orgId,
      createdBy: userId,
      campaignId: args.campaignId,
      aspectRatio: c.aspectRatio ?? undefined,
      model: model.id,
      modelLabel: model.label,
      instructions: args.instructions,
      copySnapshot: c.copy ?? undefined,
    });

    await ctx.scheduler.runAfter(0, internal.ads.runAdLayout, {
      adId,
      campaignId: args.campaignId,
      orgId,
      userId,
      openaiModel: model.openaiModel,
      modelId: model.id,
      modelLabel: model.label,
      instructions: args.instructions,
      existingSlots: [],
    });

    return { adId };
  },
});

/** Regenerate the layout for an existing ad, preserving media bindings by id. */
export const regenerateAd = action({
  args: { adId: v.id("campaignAds"), instructions: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const userId = identity.subject;
    const orgId = (identity.org_id as string | undefined) ?? `user:${userId}`;

    const info = await ctx.runQuery(internal.ads.adInfo, { adId: args.adId });
    if (!info || info.orgId !== orgId) throw new Error("Not found");

    const model =
      getTextModel(info.model ?? DEFAULT_TEXT_MODEL_ID) ??
      getTextModel(DEFAULT_TEXT_MODEL_ID)!;

    await ctx.runMutation(internal.ads.resetAd, { adId: args.adId });
    await ctx.scheduler.runAfter(0, internal.ads.runAdLayout, {
      adId: args.adId,
      campaignId: info.campaignId,
      orgId,
      userId,
      openaiModel: model.openaiModel,
      modelId: model.id,
      modelLabel: model.label,
      instructions: args.instructions ?? info.instructions,
      existingSlots: info.slots ?? [],
    });
    return { adId: args.adId };
  },
});

export const createAd = internalMutation({
  args: {
    orgId: v.string(),
    createdBy: v.string(),
    campaignId: v.id("campaigns"),
    aspectRatio: v.optional(v.string()),
    model: v.optional(v.string()),
    modelLabel: v.optional(v.string()),
    instructions: v.optional(v.string()),
    copySnapshot: v.optional(adCopy),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("campaignAds", {
      ...args,
      status: "generating",
      slots: [],
    });
  },
});

export const resetAd = internalMutation({
  args: { adId: v.id("campaignAds") },
  handler: async (ctx, { adId }) => {
    await ctx.db.patch(adId, { status: "generating", error: undefined });
  },
});

export const adInfo = internalQuery({
  args: { adId: v.id("campaignAds") },
  handler: async (ctx, { adId }) => {
    const ad = await ctx.db.get(adId);
    if (!ad) return null;
    return {
      orgId: ad.orgId,
      campaignId: ad.campaignId,
      model: ad.model,
      instructions: ad.instructions,
      slots: ad.slots ?? [],
    };
  },
});

export const attachAd = internalMutation({
  args: {
    adId: v.id("campaignAds"),
    status: v.union(v.literal("succeeded"), v.literal("failed")),
    html: v.optional(v.string()),
    slots: v.optional(v.array(adSlot)),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { adId, ...patch }) => {
    await ctx.db.patch(adId, patch);
  },
});

/** Worker: ask the model for the HTML layout, parse slots, persist. */
export const runAdLayout = internalAction({
  args: {
    adId: v.id("campaignAds"),
    campaignId: v.id("campaigns"),
    orgId: v.string(),
    userId: v.string(),
    openaiModel: v.string(),
    modelId: v.string(),
    modelLabel: v.optional(v.string()),
    instructions: v.optional(v.string()),
    existingSlots: v.array(adSlot),
  },
  handler: async (ctx, args) => {
    const logUsage = (status: "succeeded" | "failed", error?: string) =>
      ctx.runMutation(internal.usage.record, {
        orgId: args.orgId,
        userId: args.userId,
        kind: "campaign_copy" as const,
        provider: "openai",
        modelKey: args.modelId,
        modelLabel: args.modelLabel,
        status,
        campaignId: args.campaignId,
        isText: true,
        error,
      });

    try {
      const c = await ctx.runQuery(internal.campaigns.adContext, {
        id: args.campaignId,
      });

      const raw = await chatText({
        model: args.openaiModel,
        system: LAYOUT_SYSTEM,
        user: buildLayoutUser({
          copy: c.copy ?? {},
          aspectRatio: c.aspectRatio,
          shotCount: c.shots.length,
          instructions: args.instructions,
        }),
      });

      const html = sanitizeHtml(raw);
      const ids = parseSlots(html);
      if (!ids.length) {
        throw new Error("The layout had no media slots — try regenerating.");
      }

      // Build slots, reusing any prior binding with the same id; auto-bind the
      // first unbound slot to the first picked shot.
      const prior = new Map(args.existingSlots.map((s) => [s.id, s]));
      let autoUsed = false;
      const slots = ids.map((id) => {
        const existing = prior.get(id);
        if (existing && existing.sourceId) return { ...existing, label: id };
        if (!autoUsed && c.shots[0]) {
          autoUsed = true;
          return {
            id,
            label: id,
            kind: "image" as const,
            source: "shot",
            sourceId: c.shots[0].generationId,
            mediaUrl: c.shots[0].url,
          };
        }
        return { id, label: id, kind: "image" as const };
      });

      await ctx.runMutation(internal.ads.attachAd, {
        adId: args.adId,
        status: "succeeded",
        html,
        slots,
      });
      await logUsage("succeeded");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.ads.attachAd, {
        adId: args.adId,
        status: "failed",
        error: msg,
      });
      await logUsage("failed", msg);
    }
  },
});

/* ─────────────────────────── editing ─────────────────────────── */

/** Bind a piece of media (shot / creative / video) to one slot. */
export const setAdSlot = mutation({
  args: {
    adId: v.id("campaignAds"),
    slotId: v.string(),
    kind: slotKind,
    source: v.string(), // "shot" | "creative" | "video"
    sourceId: v.string(),
    mediaUrl: v.optional(v.string()),
    posterUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scope = await getScope(ctx);
    const ad = assertOrg(await ctx.db.get(args.adId), scope);
    const slots = (ad.slots ?? []).map((s) =>
      s.id === args.slotId
        ? {
            ...s,
            kind: args.kind,
            source: args.source,
            sourceId: args.sourceId,
            mediaUrl: args.mediaUrl,
            posterUrl: args.posterUrl,
          }
        : s,
    );
    await ctx.db.patch(args.adId, { slots });
  },
});

export const removeAd = mutation({
  args: { adId: v.id("campaignAds") },
  handler: async (ctx, { adId }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(adId), scope);
    await ctx.db.delete(adId);
  },
});
