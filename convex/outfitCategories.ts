import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getScope, assertOrg } from "./lib/auth";

/** All categories for the workspace, ordered, with a live outfit count. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const scope = await getScope(ctx);
    const cats = await ctx.db
      .query("outfitCategories")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .collect();
    const outfits = await ctx.db
      .query("outfits")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .collect();
    const counts = new Map<string, number>();
    for (const o of outfits) {
      if (o.archived || !o.categoryId) continue;
      counts.set(o.categoryId, (counts.get(o.categoryId) ?? 0) + 1);
    }
    return cats
      .map((c) => ({ ...c, count: counts.get(c._id) ?? 0 }))
      .sort(
        (a, b) =>
          (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name),
      );
  },
});

/**
 * Create a category, or return the existing one with the same (case-insensitive)
 * name — so typing an existing name in the combobox never makes a duplicate.
 */
export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const scope = await getScope(ctx);
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Category name is required");

    const existing = await ctx.db
      .query("outfitCategories")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .collect();
    const dupe = existing.find(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (dupe) return dupe._id;

    const maxOrder = existing.reduce((m, c) => Math.max(m, c.order ?? 0), 0);
    return await ctx.db.insert("outfitCategories", {
      orgId: scope.orgId,
      createdBy: scope.userId,
      name: trimmed,
      order: maxOrder + 1,
    });
  },
});

export const rename = mutation({
  args: { id: v.id("outfitCategories"), name: v.string() },
  handler: async (ctx, { id, name }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Category name is required");
    await ctx.db.patch(id, { name: trimmed });
  },
});

/** Delete a category and clear it from any outfits that referenced it. */
export const remove = mutation({
  args: { id: v.id("outfitCategories") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);

    const outfits = await ctx.db
      .query("outfits")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .collect();
    for (const o of outfits) {
      if (o.categoryId === id) {
        await ctx.db.patch(o._id, { categoryId: undefined });
      }
    }
    await ctx.db.delete(id);
  },
});
