"use node";
/**
 * Symmetric encryption for user-supplied integration secrets (Shopify / Printify
 * / Buffer API keys). Secrets are encrypted at rest in the `integrations` table
 * and only ever decrypted inside `"use node"` actions immediately before an
 * outbound API call — they are never returned to the client or exposed via MCP.
 *
 * AES-256-GCM with a random 96-bit IV per secret; the GCM auth tag is stored
 * alongside so tampering is detected on decrypt. The key comes from the
 * `INTEGRATIONS_ENCRYPTION_KEY` Convex env var (32 raw bytes, base64-encoded):
 *
 *   npx convex env set INTEGRATIONS_ENCRYPTION_KEY "$(openssl rand -base64 32)"
 *
 * This module uses node:crypto, so it may only be imported from a `"use node"`
 * Convex module (e.g. convex/integrationsNode.ts).
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface EncryptedSecret {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
}

function encryptionKey(): Buffer {
  const b64 = process.env.INTEGRATIONS_ENCRYPTION_KEY;
  if (!b64) {
    throw new Error(
      "INTEGRATIONS_ENCRYPTION_KEY is not set. Generate one with " +
        '`npx convex env set INTEGRATIONS_ENCRYPTION_KEY "$(openssl rand -base64 32)"`.',
    );
  }
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error(
      `INTEGRATIONS_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}).`,
    );
  }
  return key;
}

/** Encrypt a plaintext secret. Returns the ciphertext, IV, and GCM auth tag. */
export function encryptSecret(plaintext: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

/** Decrypt a secret produced by {@link encryptSecret}. Throws if tampered. */
export function decryptSecret(e: EncryptedSecret): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(e.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(e.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(e.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
