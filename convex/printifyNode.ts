"use node";
/**
 * Printify integration (node runtime): sync the connected shop's products and
 * orders into Convex so the Store dashboard + MCP can read costs, orders and
 * shipping without hitting the API on every request.
 *
 * Public tool: printifyNode:sync (reads live via printify:products/orders/summary).
 */
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { loadConnection, markUsed } from "./lib/connection";
import {
  printifyPaginate,
  printifyFetch,
  type PrintifyProduct,
  type PrintifyOrder,
} from "./lib/providerClients";

async function resolveShopId(
  secret: string,
  meta: Record<string, unknown>,
): Promise<number> {
  const fromMeta = meta.shopId;
  if (typeof fromMeta === "number") return fromMeta;
  const shops = await printifyFetch<Array<{ id: number }>>(
    secret,
    "shops.json",
  );
  if (!shops[0]) throw new Error("No Printify shops found for this account.");
  return shops[0].id;
}

function mapProduct(p: PrintifyProduct, shopId: number) {
  const enabled = (p.variants ?? []).filter((vr) => vr.is_enabled !== false);
  const costs = enabled
    .map((vr) => vr.cost)
    .filter((n): n is number => typeof n === "number");
  const prices = enabled
    .map((vr) => vr.price)
    .filter((n): n is number => typeof n === "number");
  return {
    shopId,
    externalId: `printify:${p.id}`,
    productId: String(p.id),
    title: p.title,
    images: (p.images ?? []).slice(0, 4).map((i) => i.src),
    variantCount: (p.variants ?? []).length,
    cost: costs.length ? Math.min(...costs) : undefined,
    price: prices.length ? Math.min(...prices) : undefined,
    visible: p.visible,
  };
}

function mapOrder(o: PrintifyOrder, shopId: number) {
  const productionCost = (o.line_items ?? []).reduce(
    (s, li) => s + (li.cost ?? 0) * (li.quantity ?? 1),
    0,
  );
  return {
    shopId,
    externalId: `printify:order:${o.id}`,
    orderId: String(o.id),
    status: o.status,
    totalPrice: o.total_price,
    totalShipping: o.total_shipping,
    productionCost,
    lineItemCount: (o.line_items ?? []).length,
    shipments: (o.shipments ?? []).map((s) => ({
      carrier: s.carrier,
      number: s.number,
      url: s.url,
      deliveredAt: s.delivered_at,
    })),
    address: o.address_to
      ? {
          country: o.address_to.country,
          region: o.address_to.region,
          city: o.address_to.city,
        }
      : undefined,
    placedAt: o.created_at,
  };
}

export interface PrintifySyncResult {
  shopId: number;
  products: number;
  orders: number;
}

export const sync = action({
  args: { shopId: v.optional(v.number()), maxOrders: v.optional(v.number()) },
  handler: async (
    ctx,
    { shopId, maxOrders },
  ): Promise<PrintifySyncResult> => {
    const { scope, secret, meta } = await loadConnection(ctx, "printify");
    const resolvedShop = shopId ?? (await resolveShopId(secret, meta));

    const rawProducts = await printifyPaginate<PrintifyProduct>(
      secret,
      `shops/${resolvedShop}/products.json`,
    );
    const rawOrders = await printifyPaginate<PrintifyOrder>(
      secret,
      `shops/${resolvedShop}/orders.json`,
      maxOrders ?? 200,
    );

    await ctx.runMutation(internal.printify.applyProducts, {
      products: rawProducts.map((p) => mapProduct(p, resolvedShop)),
    });
    await ctx.runMutation(internal.printify.applyOrders, {
      orders: rawOrders.map((o) => mapOrder(o, resolvedShop)),
    });
    await markUsed(ctx, scope, "printify");
    return {
      shopId: resolvedShop,
      products: rawProducts.length,
      orders: rawOrders.length,
    };
  },
});
