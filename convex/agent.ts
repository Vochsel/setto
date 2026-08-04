/**
 * Backend surface for the messaging agent (Telegram / iMessage).
 *
 * Everything else in this app authenticates as a signed-in WorkOS user. The
 * agent can't: the "user" is whoever is messaging the bot, and there is no
 * browser session behind it. So this module is the one place that accepts
 * a **shared secret** instead of a user JWT, and it is deliberately small and
 * read-mostly.
 *
 * How a phone becomes a workspace:
 *   - `agentBindings` maps a messaging principal (a Telegram chat id, or a
 *     phone number) to an org + the user to attribute work to. No binding, no
 *     access — an unknown sender gets nothing, which is what stops a stranger
 *     who finds the bot from reading your catalogue.
 *   - Bind one from the CLI (the functions are internal, so they can't be
 *     called from the open internet at all):
 *       npx convex run agent:bind '{"principal":"telegram:123456","orgId":"...","userId":"...","label":"Ben"}' --prod
 *
 * The secret is checked with a length-safe comparison and is required on every
 * public function here. Set it on both sides:
 *   npx convex env set AGENT_SHARED_SECRET "$(openssl rand -hex 32)" --prod
 */
import {
  action,
  query,
  internalAction,
  internalMutation,
  internalQuery,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { resolveImages } from "./files";
import { buildShotBrief, type ShotContext } from "./lib/shotAssembly";
import { estimateCost, getImageModel } from "./lib/imageModels";

/** Constant-time-ish equality — never leak secret length via early exit. */
function secretMatches(provided: string): boolean {
  const expected = process.env.AGENT_SHARED_SECRET ?? "";
  if (!expected) return false;
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Canonical form for a messaging identity.
 *
 * A phone number written five ways is still one person, so digits-only with a
 * leading `+`. Namespaced ids (`telegram:12345`) are already canonical and pass
 * through lowercased.
 */
function normalizePrincipal(principal: string): string {
  const trimmed = principal.trim();
  if (trimmed.includes(":")) return trimmed.toLowerCase();
  return `+${trimmed.replace(/[^\d]/g, "")}`;
}

export const bind = internalMutation({
  args: {
    principal: v.string(),
    orgId: v.string(),
    userId: v.string(),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const principal = normalizePrincipal(args.principal);
    const existing = await ctx.db
      .query("agentBindings")
      .withIndex("by_principal", (q) => q.eq("principal", principal))
      .unique();
    const row = {
      principal,
      orgId: args.orgId,
      userId: args.userId,
      label: args.label,
    };
    if (existing) {
      await ctx.db.patch(existing._id, row);
      return { updated: true, principal };
    }
    await ctx.db.insert("agentBindings", row);
    return { created: true, principal };
  },
});

export const listBindings = internalQuery({
  args: {},
  handler: async (ctx) => await ctx.db.query("agentBindings").collect(),
});

export const resolveBinding = internalQuery({
  args: { principal: v.string() },
  handler: async (ctx, { principal }) =>
    await ctx.db
      .query("agentBindings")
      .withIndex("by_principal", (q) =>
        q.eq("principal", normalizePrincipal(principal)),
      )
      .unique(),
});

/** Resolve a caller to its workspace, or refuse. */
async function authorize(
  ctx: QueryCtx,
  secret: string,
  principal: string,
): Promise<{ orgId: string; userId: string }> {
  if (!secretMatches(secret)) throw new Error("Not authorized");
  const binding = await ctx.db
    .query("agentBindings")
    .withIndex("by_principal", (q) =>
      q.eq("principal", normalizePrincipal(principal)),
    )
    .unique();
  if (!binding) throw new Error(`No workspace is bound to ${principal}`);
  return { orgId: binding.orgId, userId: binding.userId };
}

const auth = { secret: v.string(), principal: v.string() };

/* ────────────────────────── reads ────────────────────────── */

/**
 * Products, with the one number that drives the whole daily-suggestion loop:
 * how many finished photos each already has.
 */
export const products = query({
  args: {
    ...auth,
    onlyUnshot: v.optional(v.boolean()),
    query: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { orgId } = await authorize(ctx, args.secret, args.principal);
    const rows = await ctx.db
      .query("outfits")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .order("desc")
      .collect();

    const gens = await ctx.db
      .query("generations")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const shots = new Map<string, number>();
    for (const g of gens) {
      if (g.status !== "succeeded" || !g.outfitId) continue;
      shots.set(g.outfitId, (shots.get(g.outfitId) ?? 0) + 1);
    }

    const needle = args.query?.trim().toLowerCase();
    const out = [];
    for (const r of rows) {
      if (r.archived) continue;
      const photos = shots.get(r._id) ?? 0;
      if (args.onlyUnshot && photos > 0) continue;
      if (needle && !`${r.name} ${r.description ?? ""}`.toLowerCase().includes(needle))
        continue;
      const images = await resolveImages(ctx, r.images);
      out.push({
        id: r._id,
        name: r.name,
        description: r.description,
        photos,
        variants: (r.variations ?? []).map((x) => ({ id: x.id, name: x.name })),
        imageUrl: images[0]?.url,
        fromShopify: Boolean(r.externalId?.startsWith("shopify:")),
        addedAt: r._creationTime,
      });
      if (args.limit && out.length >= args.limit) break;
    }
    return out;
  },
});

/** People and places available to shoot with. */
export const cast = query({
  args: auth,
  handler: async (ctx, args) => {
    const { orgId } = await authorize(ctx, args.secret, args.principal);
    const [models, locations] = await Promise.all([
      ctx.db
        .query("models")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect(),
      ctx.db
        .query("locations")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect(),
    ]);
    return {
      models: models
        .filter((m) => !m.archived)
        .map((m) => ({ id: m._id, name: m.name })),
      locations: locations
        .filter((l) => !l.archived)
        .map((l) => ({ id: l._id, name: l.name, address: l.address })),
    };
  },
});

/** Recent finished images, newest first. Optionally one product's, or favourites. */
export const gallery = query({
  args: {
    ...auth,
    productId: v.optional(v.id("outfits")),
    favouritesOnly: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { orgId } = await authorize(ctx, args.secret, args.principal);
    const gens = await ctx.db
      .query("generations")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .order("desc")
      .collect();
    const out = [];
    for (const g of gens) {
      if (g.status !== "succeeded") continue;
      if (args.productId && g.outfitId !== args.productId) continue;
      if (args.favouritesOnly && !g.favorite) continue;
      let url = g.imageUrl;
      if (!url && g.storageId) {
        url = (await ctx.storage.getUrl(g.storageId)) ?? undefined;
      }
      if (!url) continue;
      out.push({
        id: g._id,
        url,
        productId: g.outfitId,
        favorite: g.favorite ?? false,
        rating: g.rating,
        createdAt: g._creationTime,
      });
      if (out.length >= (args.limit ?? 12)) break;
    }
    return out;
  },
});

/** Saved flow templates the agent can re-run. */
export const flows = query({
  args: auth,
  handler: async (ctx, args) => {
    const { orgId } = await authorize(ctx, args.secret, args.principal);
    const rows = await ctx.db
      .query("flows")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    return rows
      .filter((r) => !r.archived)
      .map((r) => ({
        id: r._id,
        name: r.name,
        description: r.description,
        lastRunAt: r.lastRunAt,
      }));
  },
});

/* ────────────────────────── writes ────────────────────────── */

/** The cheap tier — an agent told to "shoot everything" should cost cents. */
export const AGENT_DEFAULT_MODEL_KEY = "openai/gpt-image-2-low";

/**
 * Queue the generations for one product/person/place combination.
 *
 * Deliberately the same assembly (`buildShotBrief`) and the same executor
 * (`generate:runOne`) as the web app and flows, so an image the agent made is
 * indistinguishable from one made by hand.
 */
export const runGenerate = internalAction({
  args: {
    orgId: v.string(),
    userId: v.string(),
    productId: v.id("outfits"),
    variantId: v.optional(v.string()),
    modelId: v.optional(v.id("models")),
    locationId: v.optional(v.id("locations")),
    prompt: v.optional(v.string()),
    count: v.number(),
    modelKey: v.string(),
  },
  handler: async (ctx, args): Promise<{ generationIds: string[] }> => {
    const imageModel = getImageModel(args.modelKey);
    if (!imageModel) throw new Error(`Unknown model: ${args.modelKey}`);

    const context = await ctx.runQuery(internal.generations.quickContext, {
      orgId: args.orgId,
      modelId: args.modelId,
      outfitId: args.productId,
      locationId: args.locationId,
      variationId: args.variantId,
    });

    const generationIds: string[] = [];
    for (let index = 0; index < args.count; index++) {
      const brief = buildShotBrief({
        context: context as ShotContext,
        model: imageModel,
        direction: { extraPrompt: args.prompt },
        index,
      });
      const genId: Id<"generations"> = await ctx.runMutation(
        internal.generations.create,
        {
          orgId: args.orgId,
          createdBy: args.userId,
          outfitId: args.productId,
          variationId: args.variantId,
          modelId: args.modelId,
          locationId: args.locationId,
          provider: imageModel.provider,
          modelKey: args.modelKey,
          modelLabel: imageModel.label,
          prompt: brief.prompt,
          negativePrompt: brief.negativePrompt,
        },
      );
      generationIds.push(genId);
      await ctx.scheduler.runAfter(0, internal.generate.runOne, {
        genId,
        modelKey: args.modelKey,
        prompt: brief.prompt,
        referenceImageUrls: brief.referenceImageUrls,
      });
    }
    return { generationIds };
  },
});

/**
 * Generate photos of a product.
 *
 * Spending money is the one thing this surface does that can't be undone by
 * deleting a row, so the cost is computed and returned on every call and the
 * count is hard-capped — an agent looping on "make me some more" can waste real
 * money surprisingly fast.
 */
export const generate = action({
  args: {
    ...auth,
    productId: v.id("outfits"),
    variantId: v.optional(v.string()),
    modelId: v.optional(v.id("models")),
    locationId: v.optional(v.id("locations")),
    prompt: v.optional(v.string()),
    count: v.optional(v.number()),
    modelKey: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    generationIds: string[];
    images: number;
    estimatedCostUsd: number;
    modelKey: string;
  }> => {
    const binding = await ctx.runQuery(internal.agent.resolveBinding, {
      principal: args.principal,
    });
    if (!secretMatches(args.secret)) throw new Error("Not authorized");
    if (!binding) throw new Error(`No workspace is bound to ${args.principal}`);

    const count = Math.max(1, Math.min(4, Math.round(args.count ?? 1)));
    const modelKey = args.modelKey ?? AGENT_DEFAULT_MODEL_KEY;
    if (!getImageModel(modelKey)) throw new Error(`Unknown model: ${modelKey}`);

    const result: { generationIds: string[] } = await ctx.runAction(
      internal.agent.runGenerate,
      {
        orgId: binding.orgId,
        userId: binding.userId,
        productId: args.productId,
        variantId: args.variantId,
        modelId: args.modelId,
        locationId: args.locationId,
        prompt: args.prompt,
        count,
        modelKey,
      },
    );
    return {
      generationIds: result.generationIds,
      images: result.generationIds.length,
      estimatedCostUsd:
        Math.round(estimateCost(modelKey) * result.generationIds.length * 1000) /
        1000,
      modelKey,
    };
  },
});

/** Rate / favourite an image the agent (or the person texting it) liked. */
export const review = action({
  args: {
    ...auth,
    generationId: v.id("generations"),
    favorite: v.optional(v.boolean()),
    rating: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    if (!secretMatches(args.secret)) throw new Error("Not authorized");
    const binding = await ctx.runQuery(internal.agent.resolveBinding, {
      principal: args.principal,
    });
    if (!binding) throw new Error(`No workspace is bound to ${args.principal}`);
    await ctx.runMutation(internal.agent.applyReview, {
      orgId: binding.orgId,
      generationId: args.generationId,
      favorite: args.favorite,
      rating: args.rating,
    });
    return { ok: true };
  },
});

export const applyReview = internalMutation({
  args: {
    orgId: v.string(),
    generationId: v.id("generations"),
    favorite: v.optional(v.boolean()),
    rating: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.generationId);
    if (!doc || doc.orgId !== args.orgId) throw new Error("Not found");
    const patch: { favorite?: boolean; rating?: number } = {};
    if (args.favorite !== undefined) patch.favorite = args.favorite;
    if (args.rating !== undefined) {
      patch.rating = Math.max(1, Math.min(5, Math.round(args.rating)));
    }
    await ctx.db.patch(args.generationId, patch);
  },
});

/** Pull the Shopify catalogue for the bound workspace. */
export const syncShopify = action({
  args: { ...auth, limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<unknown> => {
    if (!secretMatches(args.secret)) throw new Error("Not authorized");
    const binding = await ctx.runQuery(internal.agent.resolveBinding, {
      principal: args.principal,
    });
    if (!binding) throw new Error(`No workspace is bound to ${args.principal}`);
    return await ctx.runAction(internal.shopify.syncFor, {
      orgId: binding.orgId,
      userId: binding.userId,
      limit: args.limit,
    });
  },
});
