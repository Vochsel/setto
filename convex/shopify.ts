"use node";
/**
 * Shopify integration (node runtime). Pulls the connected store's product
 * catalog in as wardrobe: `sync` imports/updates products into the shared
 * `outfits` library, `products` returns a live preview without writing.
 *
 * Auth is the per-user encrypted connection (Settings → Connections). These are
 * public actions, so they're also available as MCP tools (`shopify:sync`,
 * `shopify:products`) to the connected user.
 */
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { loadConnection, markUsed } from "./lib/connection";
import {
  shopifyListProducts,
  shopifyDomain,
  stripHtml,
  type ShopifyProduct,
} from "./lib/providerClients";

/** Map a raw Shopify product to our outfit/wardrobe payload. */
function mapProduct(p: ShopifyProduct, domain: string) {
  const imageById = new Map((p.images ?? []).map((im) => [im.id, im]));
  const images = (p.images ?? []).map((im) => ({
    url: im.src,
    caption: im.alt ?? undefined,
    source: "shopify",
  }));
  const variations = (p.variants ?? []).map((vr) => {
    const img = vr.image_id ? imageById.get(vr.image_id) : undefined;
    return {
      id: `shopify:${vr.id}`,
      name: vr.title,
      images: img ? [{ url: img.src, source: "shopify" }] : undefined,
    };
  });
  return {
    externalId: `shopify:${p.id}`,
    name: p.title,
    description: stripHtml(p.body_html),
    categoryName: p.product_type || undefined,
    images,
    variations,
    externalMeta: {
      handle: p.handle,
      productType: p.product_type ?? undefined,
      status: p.status,
      updatedAt: p.updated_at,
      url: `https://${domain}/products/${p.handle}`,
    },
  };
}

/** Live preview of the store's products (no write). */
export const products = action({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const { scope, meta } = await loadConnection(ctx, "shopify");
    const raw = await shopifyListProducts(meta, limit ?? 50);
    await markUsed(ctx, scope, "shopify");
    return raw.map((p) => ({
      externalId: `shopify:${p.id}`,
      title: p.title,
      productType: p.product_type ?? undefined,
      image: p.images?.[0]?.src,
      variantCount: p.variants?.length ?? 0,
    }));
  },
});

export interface SyncResult {
  created: number;
  updated: number;
  categoriesCreated: number;
  total: number;
}

/** Import (or update) the store's products into the shared wardrobe. */
export const sync = action({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }): Promise<SyncResult> => {
    const { scope, meta } = await loadConnection(ctx, "shopify");
    const domain = shopifyDomain(meta);
    const raw = await shopifyListProducts(meta, limit);
    const mapped = raw.map((p) => mapProduct(p, domain));
    const result = await ctx.runMutation(internal.shopifyData.applyProducts, {
      products: mapped,
    });
    await markUsed(ctx, scope, "shopify");
    return result;
  },
});
