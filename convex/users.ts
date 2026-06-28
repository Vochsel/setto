import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getScope, getScopeOrNull } from "./lib/auth";

/**
 * Upsert the authenticated user (and cache their active org name). Called from
 * the client once auth is ready.
 */
export const store = mutation({
  args: {
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    orgName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scope = await getScope(ctx);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosId", scope.userId))
      .unique();

    const patch = {
      name: args.name ?? scope.name,
      email: args.email ?? scope.email,
      avatarUrl: args.avatarUrl,
      lastSeenAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("users", { workosId: scope.userId, ...patch });
    }

    // Cache org name for the team switcher (skip personal workspaces).
    if (!scope.orgId.startsWith("user:") && args.orgName) {
      const org = await ctx.db
        .query("organizations")
        .withIndex("by_workos_org_id", (q) => q.eq("workosOrgId", scope.orgId))
        .unique();
      if (org) {
        if (org.name !== args.orgName)
          await ctx.db.patch(org._id, { name: args.orgName });
      } else {
        await ctx.db.insert("organizations", {
          workosOrgId: scope.orgId,
          name: args.orgName,
        });
      }
    }
    return { orgId: scope.orgId };
  },
});

export const current = query({
  args: {},
  handler: async (ctx) => {
    const scope = await getScopeOrNull(ctx);
    if (!scope) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosId", scope.userId))
      .unique();
    let orgName: string | undefined;
    if (!scope.orgId.startsWith("user:")) {
      const org = await ctx.db
        .query("organizations")
        .withIndex("by_workos_org_id", (q) => q.eq("workosOrgId", scope.orgId))
        .unique();
      orgName = org?.name;
    }
    return {
      userId: scope.userId,
      orgId: scope.orgId,
      isPersonal: scope.orgId.startsWith("user:"),
      orgName,
      name: user?.name ?? scope.name,
      email: user?.email ?? scope.email,
      avatarUrl: user?.avatarUrl,
    };
  },
});
