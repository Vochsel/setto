/**
 * Printify integration — read side + storage (V8 runtime).
 *
 * Products and orders are synced into `printifyProducts` / `printifyOrders`
 * (org-scoped, so the whole workspace sees them) by the node action in
 * convex/printifyNode.ts. Here we expose the cached data as queries the Store
 * dashboard and MCP use, plus the internal upsert mutations the sync calls.
 *
 * Public tools: printify:products, printify:orders, printify:summary.
 */
import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getScope } from "./lib/auth";

/** Cached Printify products for the workspace (production cost vs. retail). */
export const products = query({
  args: {},
  handler: async (ctx) => {
    const scope = await getScope(ctx);
    return await ctx.db
      .query("printifyProducts")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .collect();
  },
});

/** Cached Printify orders for the workspace (costs, status, shipping). */
export const orders = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const scope = await getScope(ctx);
    const rows = await ctx.db
      .query("printifyOrders")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .collect();
    rows.sort((a, b) => (b.placedAt ?? "").localeCompare(a.placedAt ?? ""));
    return limit ? rows.slice(0, limit) : rows;
  },
});

/** A rollup for the Store dashboard: catalog size, revenue, cost, fulfillment. */
export const summary = query({
  args: {},
  handler: async (ctx) => {
    const scope = await getScope(ctx);
    const [prods, ords] = await Promise.all([
      ctx.db
        .query("printifyProducts")
        .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
        .collect(),
      ctx.db
        .query("printifyOrders")
        .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
        .collect(),
    ]);
    const fulfilled = new Set(["fulfilled", "shipped", "delivered"]);
    const revenue = ords.reduce((s, o) => s + (o.totalPrice ?? 0), 0);
    const productionCost = ords.reduce(
      (s, o) => s + (o.productionCost ?? 0) + (o.totalShipping ?? 0),
      0,
    );
    return {
      productCount: prods.length,
      orderCount: ords.length,
      openOrders: ords.filter((o) => !fulfilled.has(o.status ?? "")).length,
      revenue, // minor units
      productionCost, // minor units (incl. shipping)
      margin: revenue - productionCost,
      currency: ords[0]?.currency ?? prods[0]?.currency,
    };
  },
});

// ── Internal upserts (called by the sync action) ───────────────────────────

export const applyProducts = internalMutation({
  args: {
    products: v.array(
      v.object({
        shopId: v.number(),
        externalId: v.string(),
        productId: v.string(),
        title: v.string(),
        images: v.optional(v.array(v.string())),
        variantCount: v.number(),
        cost: v.optional(v.number()),
        price: v.optional(v.number()),
        currency: v.optional(v.string()),
        visible: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, { products }) => {
    const scope = await getScope(ctx);
    const now = Date.now();
    let upserted = 0;
    for (const p of products) {
      const existing = await ctx.db
        .query("printifyProducts")
        .withIndex("by_org_external", (q) =>
          q.eq("orgId", scope.orgId).eq("externalId", p.externalId),
        )
        .unique();
      const doc = {
        orgId: scope.orgId,
        syncedBy: scope.userId,
        syncedAt: now,
        ...p,
      };
      if (existing) await ctx.db.patch(existing._id, doc);
      else await ctx.db.insert("printifyProducts", doc);
      upserted++;
    }
    return { upserted };
  },
});

export const applyOrders = internalMutation({
  args: {
    orders: v.array(
      v.object({
        shopId: v.number(),
        externalId: v.string(),
        orderId: v.string(),
        status: v.optional(v.string()),
        totalPrice: v.optional(v.number()),
        totalShipping: v.optional(v.number()),
        productionCost: v.optional(v.number()),
        currency: v.optional(v.string()),
        lineItemCount: v.number(),
        shipments: v.optional(v.any()),
        address: v.optional(v.any()),
        placedAt: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { orders }) => {
    const scope = await getScope(ctx);
    const now = Date.now();
    let upserted = 0;
    for (const o of orders) {
      const existing = await ctx.db
        .query("printifyOrders")
        .withIndex("by_org_external", (q) =>
          q.eq("orgId", scope.orgId).eq("externalId", o.externalId),
        )
        .unique();
      const doc = {
        orgId: scope.orgId,
        syncedBy: scope.userId,
        syncedAt: now,
        ...o,
      };
      if (existing) await ctx.db.patch(existing._id, doc);
      else await ctx.db.insert("printifyOrders", doc);
      upserted++;
    }
    return { upserted };
  },
});
