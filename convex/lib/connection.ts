"use node";
/**
 * Shared helper for the provider `"use node"` actions: load a caller's connection
 * and decrypt its secret, ready for an outbound API call. Throws a friendly error
 * if the provider isn't connected. Uses node:crypto (via lib/crypto), so it may
 * only be imported from a `"use node"` module.
 */
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { getScope, type Scope } from "./auth";
import { decryptSecret } from "./crypto";

export interface LoadedConnection {
  scope: Scope;
  secret: string;
  meta: Record<string, unknown>;
}

export async function loadConnection(
  ctx: ActionCtx,
  provider: string,
): Promise<LoadedConnection> {
  const scope = await getScope(ctx);
  const row = await ctx.runQuery(internal.integrations.getRow, {
    orgId: scope.orgId,
    userId: scope.userId,
    provider,
  });
  if (!row) {
    throw new Error(
      `Not connected to ${provider}. Add your key in Settings → Connections.`,
    );
  }
  const secret = decryptSecret({
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.authTag,
  });
  return { scope, secret, meta: (row.meta ?? {}) as Record<string, unknown> };
}

/** Record that a connection was just used (updates lastUsedAt + clears error). */
export async function markUsed(
  ctx: ActionCtx,
  scope: Scope,
  provider: string,
): Promise<void> {
  await ctx.runMutation(internal.integrations.setStatus, {
    orgId: scope.orgId,
    userId: scope.userId,
    provider,
    status: "connected",
    lastError: null,
    lastUsedAt: Date.now(),
  });
}
