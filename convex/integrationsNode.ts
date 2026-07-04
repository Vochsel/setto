"use node";
/**
 * Node-runtime half of the integrations feature: connecting a provider (encrypt
 * the secret, store it, then verify it) and re-testing an existing connection.
 *
 * These are `action`s because they need node:crypto (encryption) and outbound
 * fetch (verification). The plaintext secret exists only here, in memory, for
 * the duration of a single call — it is written to the DB encrypted and read
 * back only by internal helpers in this file.
 */
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getScope } from "./lib/auth";
import { encryptSecret, decryptSecret } from "./lib/crypto";
import { PROVIDERS, type Provider } from "./integrations";
import { verifyProvider } from "./lib/providerClients";

function assertProvider(provider: string): asserts provider is Provider {
  if (!(PROVIDERS as readonly string[]).includes(provider)) {
    throw new Error(`Unknown provider: ${provider}`);
  }
}

/** Decrypt the caller's stored secret for a provider (or throw if not connected). */
async function loadSecret(
  ctx: ActionCtx,
  provider: Provider,
): Promise<{ secret: string; meta: Record<string, unknown> }> {
  const scope = await getScope(ctx);
  const row = await ctx.runQuery(internal.integrations.getRow, {
    orgId: scope.orgId,
    userId: scope.userId,
    provider,
  });
  if (!row) throw new Error(`Not connected to ${provider}`);
  return {
    secret: decryptSecret({
      ciphertext: row.ciphertext,
      iv: row.iv,
      authTag: row.authTag,
    }),
    meta: (row.meta ?? {}) as Record<string, unknown>,
  };
}

/**
 * Connect (or re-connect) a provider: encrypt + store the secret, then verify it
 * against the provider's API. Returns the verification result so the UI can show
 * success/failure immediately.
 */
export const connect = action({
  args: {
    provider: v.string(),
    secret: v.string(),
    meta: v.optional(v.any()),
    label: v.optional(v.string()),
  },
  handler: async (ctx, { provider, secret, meta, label }): Promise<VerifyResult> => {
    await getScope(ctx); // ensure authenticated
    assertProvider(provider);
    const trimmed = secret.trim();
    if (!trimmed) throw new Error("Secret is required");

    await ctx.runMutation(internal.integrations.upsert, {
      provider,
      label,
      meta: meta ?? {},
      ...encryptSecret(trimmed),
      status: "unverified",
      connectedAt: Date.now(),
    });

    return await ctx.runAction(internal.integrationsNode.verify, { provider });
  },
});

/** Re-verify an already-connected provider. Public so the UI/MCP can call it. */
export const test = action({
  args: { provider: v.string() },
  handler: async (ctx, { provider }): Promise<VerifyResult> => {
    assertProvider(provider);
    return await ctx.runAction(internal.integrationsNode.verify, { provider });
  },
});

export interface VerifyResult {
  ok: boolean;
  label?: string;
  error?: string;
}

/**
 * Internal: decrypt the stored secret, hit the provider's auth endpoint, and
 * record the outcome (status + label + any discovered meta) on the row.
 */
export const verify = internalAction({
  args: { provider: v.string() },
  handler: async (ctx, { provider }): Promise<VerifyResult> => {
    const scope = await getScope(ctx);
    assertProvider(provider);
    const { secret, meta } = await loadSecret(ctx, provider);
    try {
      const result = await verifyProvider(provider, secret, meta);
      await ctx.runMutation(internal.integrations.setStatus, {
        orgId: scope.orgId,
        userId: scope.userId,
        provider,
        status: "connected",
        lastError: null,
        lastUsedAt: Date.now(),
        label: result.label,
        meta: result.meta ?? meta,
      });
      return { ok: true, label: result.label };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.integrations.setStatus, {
        orgId: scope.orgId,
        userId: scope.userId,
        provider,
        status: "error",
        lastError: error,
      });
      return { ok: false, error };
    }
  },
});
