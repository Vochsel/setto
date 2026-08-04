/**
 * V8-runtime data layer for the Shopify integration. The `"use node"` sync
 * action (convex/shopify.ts) fetches + maps products, then hands clean payloads
 * to `applyProducts`, which upserts them into the shared `outfits` wardrobe in a
 * single transaction. Matching is by `externalId` ("shopify:<productId>"), so a
 * re-sync updates in place instead of creating duplicates.
 */
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getScope } from "./lib/auth";
import { imageRef, outfitVariation } from "./schema";

const mappedProduct = v.object({
  externalId: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  categoryName: v.optional(v.string()),
  images: v.array(imageRef),
  variations: v.array(outfitVariation),
  externalMeta: v.optional(v.any()),
});

export const applyProducts = internalMutation({
  args: {
    products: v.array(mappedProduct),
    // The iMessage agent syncs on behalf of a bound workspace, with no user
    // identity to read a scope from — see convex/agent.ts.
    scope: v.optional(v.object({ orgId: v.string(), userId: v.string() })),
  },
  handler: async (ctx, { products, scope: explicitScope }) => {
    const scope = explicitScope ?? (await getScope(ctx));

    // Resolve/create categories by name (cache within this transaction).
    const cats = await ctx.db
      .query("outfitCategories")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .collect();
    const catByName = new Map(cats.map((c) => [c.name.toLowerCase(), c._id]));
    let categoriesCreated = 0;
    async function categoryId(
      name?: string,
    ): Promise<Id<"outfitCategories"> | undefined> {
      const key = name?.trim().toLowerCase();
      if (!key) return undefined;
      const existing = catByName.get(key);
      if (existing) return existing;
      const id = await ctx.db.insert("outfitCategories", {
        orgId: scope.orgId,
        createdBy: scope.userId,
        name: name!.trim(),
      });
      catByName.set(key, id);
      categoriesCreated++;
      return id;
    }

    let created = 0;
    let updated = 0;
    for (const p of products) {
      const catId = await categoryId(p.categoryName);
      const existing = await ctx.db
        .query("outfits")
        .withIndex("by_org_external", (q) =>
          q.eq("orgId", scope.orgId).eq("externalId", p.externalId),
        )
        .unique();
      if (existing) {
        // Refresh source-owned fields; leave the user's promptDescriptor alone.
        await ctx.db.patch(existing._id, {
          name: p.name,
          description: p.description,
          categoryId: catId ?? existing.categoryId,
          images: p.images,
          variations: p.variations,
          externalMeta: p.externalMeta,
        });
        updated++;
      } else {
        await ctx.db.insert("outfits", {
          orgId: scope.orgId,
          createdBy: scope.userId,
          name: p.name,
          description: p.description,
          categoryId: catId,
          images: p.images,
          variations: p.variations,
          externalId: p.externalId,
          externalMeta: p.externalMeta,
        });
        created++;
      }
    }
    return { created, updated, categoriesCreated, total: products.length };
  },
});
