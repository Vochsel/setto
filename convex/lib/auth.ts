import { QueryCtx, MutationCtx } from "../_generated/server";

/**
 * The authenticated caller's scope. `orgId` is the sharing boundary: every team
 * member resolves to the same WorkOS org id, so all shoots/models/outfits are
 * shared. A user without an active organization gets a private workspace keyed
 * by their user id.
 */
export type Scope = {
  userId: string; // WorkOS user id (sub)
  orgId: string; // WorkOS org id, or "user:<id>" for solo workspaces
  name?: string;
  email?: string;
};

export async function getScope(ctx: QueryCtx | MutationCtx): Promise<Scope> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  const userId = identity.subject;
  const orgId =
    (identity.org_id as string | undefined) ??
    (identity.organization_id as string | undefined) ??
    `user:${userId}`;
  return {
    userId,
    orgId,
    name: identity.name,
    email: identity.email,
  };
}

/** Returns the scope, or null when unauthenticated (for "soft" queries). */
export async function getScopeOrNull(
  ctx: QueryCtx | MutationCtx,
): Promise<Scope | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const userId = identity.subject;
  const orgId =
    (identity.org_id as string | undefined) ??
    (identity.organization_id as string | undefined) ??
    `user:${userId}`;
  return { userId, orgId, name: identity.name, email: identity.email };
}

/** Asserts a fetched document belongs to the caller's org. */
export function assertOrg<T extends { orgId: string }>(
  doc: T | null,
  scope: Scope,
): T {
  if (!doc || doc.orgId !== scope.orgId) {
    throw new Error("Not found");
  }
  return doc;
}
