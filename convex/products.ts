/**
 * Products — the store-facing read surface over the `outfits` library.
 *
 * A "product" and an "outfit" are the same record. The library grew up as
 * wardrobe for shoots, then Shopify sync started importing the catalogue into
 * it (`outfits.externalId = "shopify:<id>"`, variants as outfit variations).
 * Renaming the table would churn every shot, generation and gallery that points
 * at it for no functional gain, so instead this module presents that same data
 * the way a store owner thinks about it — products, variants, images, whether
 * it's been shot yet — and the MCP tools speak only this language.
 *
 * Everything here is read-only and resolves image URLs, because the callers
 * (MCP clients, mostly) can't run a second round-trip to turn a storageId into
 * something they can look at.
 */
import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { getScope, assertOrg } from "./lib/auth";
import { resolveImages } from "./files";
import { buildShotBrief } from "./lib/shotAssembly";
import { getImageModel, DEFAULT_MODEL_ID } from "./lib/imageModels";

/** Shopify (or other) provenance, unpacked from the outfit's external fields. */
function externalOf(doc: Doc<"outfits">) {
  if (!doc.externalId) return undefined;
  const [source, id] = doc.externalId.split(":");
  const meta = (doc.externalMeta ?? {}) as Record<string, unknown>;
  return {
    source,
    id,
    handle: typeof meta.handle === "string" ? meta.handle : undefined,
    status: typeof meta.status === "string" ? meta.status : undefined,
    url: typeof meta.url === "string" ? meta.url : undefined,
    productType: typeof meta.productType === "string" ? meta.productType : undefined,
    updatedAt: typeof meta.updatedAt === "string" ? meta.updatedAt : undefined,
  };
}

/**
 * Products in the library.
 *
 * `query` matches name / description / category / handle. `source` narrows to
 * one origin ("shopify" for synced products, "manual" for hand-made ones).
 * `shotStatus` answers the question that actually starts a job — "what haven't
 * we photographed yet?" — by counting succeeded generations per product.
 */
export const list = query({
  args: {
    query: v.optional(v.string()),
    source: v.optional(v.string()),
    shotStatus: v.optional(
      v.union(v.literal("any"), v.literal("shot"), v.literal("unshot")),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const scope = await getScope(ctx);
    const rows = await ctx.db
      .query("outfits")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .order("desc")
      .collect();

    const cats = await ctx.db
      .query("outfitCategories")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .collect();
    const catName = new Map(cats.map((c) => [c._id, c.name]));

    // How many finished images each product has. One pass over the org's
    // generations beats a per-product query, and the count is what tells a
    // caller whether this product still needs a shoot.
    const gens = await ctx.db
      .query("generations")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .collect();
    const shotCount = new Map<string, number>();
    for (const g of gens) {
      if (g.status !== "succeeded" || !g.outfitId) continue;
      shotCount.set(g.outfitId, (shotCount.get(g.outfitId) ?? 0) + 1);
    }

    const needle = args.query?.trim().toLowerCase();
    const out = [];
    for (const r of rows) {
      if (r.archived) continue;
      const external = externalOf(r);
      if (args.source) {
        const source = external?.source ?? "manual";
        if (source !== args.source) continue;
      }
      const images = shotCount.get(r._id) ?? 0;
      if (args.shotStatus === "shot" && images === 0) continue;
      if (args.shotStatus === "unshot" && images > 0) continue;

      const category =
        (r.categoryId ? catName.get(r.categoryId) : undefined) ?? r.category;
      if (needle) {
        const hay = [r.name, r.description, category, external?.handle]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) continue;
      }

      out.push({
        _id: r._id,
        name: r.name,
        description: r.description,
        category,
        imageUrls: await resolveImages(ctx, r.images),
        variantCount: r.variations?.length ?? 0,
        variants: await Promise.all(
          (r.variations ?? []).map(async (x) => ({
            id: x.id,
            name: x.name,
            imageUrls: await resolveImages(ctx, x.images),
          })),
        ),
        external,
        generatedImages: images,
      });
      if (args.limit && out.length >= args.limit) break;
    }
    return out;
  },
});

/** One product, with its variants, images and store provenance. */
export const get = query({
  args: { id: v.id("outfits") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    const doc = assertOrg(await ctx.db.get(id), scope);
    const cat = doc.categoryId ? await ctx.db.get(doc.categoryId) : null;
    return {
      _id: doc._id,
      name: doc.name,
      description: doc.description,
      promptDescriptor: doc.promptDescriptor,
      category: cat?.name ?? doc.category,
      imageUrls: await resolveImages(ctx, doc.images),
      variants: await Promise.all(
        (doc.variations ?? []).map(async (x) => ({
          id: x.id,
          name: x.name,
          promptDescriptor: x.promptDescriptor,
          imageUrls: await resolveImages(ctx, x.images),
        })),
      ),
      external: externalOf(doc),
    };
  },
});

/**
 * The prompt and reference images for a product shot — without generating it.
 *
 * The same assembly the generator uses, stopped one step short. That makes it
 * free, and it's what lets a client with its own image model (ChatGPT via MCP)
 * do the expensive part and hand the result back to `generate:importImage`. It
 * doubles as a way to see exactly what we'd send a provider before paying for it.
 */
export const shotBrief = query({
  args: {
    outfitId: v.id("outfits"),
    variationId: v.optional(v.string()),
    modelId: v.optional(v.id("models")),
    locationId: v.optional(v.id("locations")),
    extraPrompt: v.optional(v.string()),
    posePrompt: v.optional(v.string()),
    /** Whose reference-handling guidance to write into the prompt. */
    modelKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scope = await getScope(ctx);
    const outfit = assertOrg(await ctx.db.get(args.outfitId), scope);
    const person = args.modelId
      ? assertOrg(await ctx.db.get(args.modelId), scope)
      : null;
    const place = args.locationId
      ? assertOrg(await ctx.db.get(args.locationId), scope)
      : null;
    const variation = args.variationId
      ? (outfit.variations ?? []).find((x) => x.id === args.variationId)
      : undefined;
    if (args.variationId && !variation) {
      throw new Error(`No variant "${args.variationId}" on this product`);
    }

    const imageModel =
      getImageModel(args.modelKey ?? DEFAULT_MODEL_ID) ??
      getImageModel(DEFAULT_MODEL_ID)!;

    // The assembler takes plain URLs; resolveImages returns {url, caption, …}.
    const urls = async (refs: Parameters<typeof resolveImages>[1]) =>
      (await resolveImages(ctx, refs)).map((i) => i.url);

    const brief = buildShotBrief({
      context: {
        model: person
          ? {
              name: person.name,
              promptDescriptor: person.promptDescriptor,
              attributes: (person.attributes ?? null) as Record<
                string,
                unknown
              > | null,
              imageUrls: await urls(person.images),
            }
          : null,
        outfit: {
          name: outfit.name,
          promptDescriptor: outfit.promptDescriptor,
          imageUrls: await urls(outfit.images),
        },
        variation: variation
          ? {
              id: variation.id,
              name: variation.name,
              promptDescriptor: variation.promptDescriptor,
              imageUrls: await urls(variation.images),
            }
          : null,
        location: place
          ? {
              name: place.name,
              address: place.address,
              promptDescriptor: place.promptDescriptor,
              streetViewUrls: await urls(place.streetViewRefs),
              imageUrls: await urls(place.images),
            }
          : null,
      },
      model: imageModel,
      direction: {
        posePrompt: args.posePrompt,
        extraPrompt: args.extraPrompt,
      },
    });

    return {
      product: { _id: outfit._id, name: outfit.name },
      variant: variation ? { id: variation.id, name: variation.name } : null,
      modelId: args.modelId,
      locationId: args.locationId,
      prompt: brief.prompt,
      negativePrompt: brief.negativePrompt,
      referenceImageUrls: brief.referenceImageUrls,
      note: "Generate this yourself, then file the result with generate:importImage to add it to the product's gallery.",
    };
  },
});

/**
 * Every product's external id, so a sync can tell what's already imported
 * without pulling the whole library down. Used by the MCP `sync_shopify` tool
 * to report which products are genuinely new.
 */
export const externalIds = query({
  args: {},
  handler: async (ctx) => {
    const scope = await getScope(ctx);
    const rows = await ctx.db
      .query("outfits")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .collect();
    return rows
      .filter((r) => r.externalId && !r.archived)
      .map((r) => ({ _id: r._id, externalId: r.externalId!, name: r.name }));
  },
});
