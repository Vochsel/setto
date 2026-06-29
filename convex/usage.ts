import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { getScope } from "./lib/auth";
import { estimateCost } from "./lib/imageModels";

const kindV = v.union(
  v.literal("shot"),
  v.literal("model_portrait"),
  v.literal("model_variation"),
);
const statusV = v.union(v.literal("succeeded"), v.literal("failed"));

/** Best-effort display name/email for an audit row, from the users cache. */
async function resolveUser(ctx: MutationCtx, userId: string) {
  const u = await ctx.db
    .query("users")
    .withIndex("by_workos_id", (q) => q.eq("workosId", userId))
    .first();
  return { userName: u?.name, userEmail: u?.email };
}

/**
 * Log a generation attempt that isn't backed by a `generations` row (model
 * portraits and variations). Cost is the model's estimate on success, else 0.
 */
export const record = internalMutation({
  args: {
    orgId: v.string(),
    userId: v.string(),
    kind: kindV,
    provider: v.string(),
    modelKey: v.string(),
    modelLabel: v.optional(v.string()),
    status: statusV,
    modelId: v.optional(v.id("models")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const { userName, userEmail } = await resolveUser(ctx, a.userId);
    await ctx.db.insert("usageEvents", {
      ...a,
      userName,
      userEmail,
      cost: a.status === "succeeded" ? estimateCost(a.modelKey) : 0,
    });
  },
});

/**
 * Log a shot generation from its `generations` row, copying provider/model and
 * the shot/shoot context links so the audit trail is fully navigable.
 */
export const recordForGeneration = internalMutation({
  args: {
    generationId: v.id("generations"),
    status: statusV,
    error: v.optional(v.string()),
  },
  handler: async (ctx, { generationId, status, error }) => {
    const g = await ctx.db.get(generationId);
    if (!g) return;
    const { userName, userEmail } = await resolveUser(ctx, g.createdBy);
    await ctx.db.insert("usageEvents", {
      orgId: g.orgId,
      userId: g.createdBy,
      userName,
      userEmail,
      kind: "shot",
      provider: g.provider,
      modelKey: g.modelKey,
      modelLabel: g.modelLabel,
      status,
      cost: status === "succeeded" ? estimateCost(g.modelKey) : 0,
      generationId,
      shotId: g.shotId,
      shootId: g.shootId,
      error,
    });
  },
});

/** Aggregated team usage: totals, this-month spend, and breakdowns. */
export const summary = query({
  args: {},
  handler: async (ctx) => {
    const scope = await getScope(ctx);
    const events = await ctx.db
      .query("usageEvents")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .collect();

    // Rolling 30-day window (anchored to now).
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    const windowStart = Date.now() - THIRTY_DAYS;

    const byModel = new Map<
      string,
      { modelKey: string; modelLabel?: string; count: number; cost: number }
    >();
    const byUser = new Map<
      string,
      { userId: string; name?: string; email?: string; count: number; cost: number }
    >();
    const byKind = new Map<string, { kind: string; count: number; cost: number }>();

    let totalCost = 0;
    let recentCost = 0;
    let succeeded = 0;
    let failed = 0;

    for (const e of events) {
      totalCost += e.cost;
      if (e._creationTime >= windowStart) recentCost += e.cost;
      if (e.status === "succeeded") succeeded++;
      else failed++;

      const m = byModel.get(e.modelKey) ?? {
        modelKey: e.modelKey,
        modelLabel: e.modelLabel,
        count: 0,
        cost: 0,
      };
      m.count++;
      m.cost += e.cost;
      byModel.set(e.modelKey, m);

      const u = byUser.get(e.userId) ?? {
        userId: e.userId,
        name: e.userName,
        email: e.userEmail,
        count: 0,
        cost: 0,
      };
      u.count++;
      u.cost += e.cost;
      byUser.set(e.userId, u);

      const k = byKind.get(e.kind) ?? { kind: e.kind, count: 0, cost: 0 };
      k.count++;
      k.cost += e.cost;
      byKind.set(e.kind, k);
    }

    const sortByCost = <T extends { cost: number; count: number }>(arr: T[]) =>
      arr.sort((a, b) => b.cost - a.cost || b.count - a.count);

    return {
      totalEvents: events.length,
      succeeded,
      failed,
      totalCost,
      recentCost,
      byModel: sortByCost([...byModel.values()]),
      byUser: sortByCost([...byUser.values()]),
      byKind: [...byKind.values()].sort((a, b) => b.count - a.count),
    };
  },
});

/** Most recent audit entries, newest first. */
export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const scope = await getScope(ctx);
    const rows = await ctx.db
      .query("usageEvents")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .order("desc")
      .take(limit ?? 100);
    return rows.map((e) => ({
      _id: e._id,
      _creationTime: e._creationTime,
      kind: e.kind,
      provider: e.provider,
      modelKey: e.modelKey,
      modelLabel: e.modelLabel,
      status: e.status,
      cost: e.cost,
      userName: e.userName,
      userEmail: e.userEmail,
      shootId: e.shootId,
      error: e.error,
    }));
  },
});
