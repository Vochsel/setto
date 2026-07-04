/**
 * Thin HTTP clients for the external services users can connect (Shopify,
 * Printify, Buffer). Each function takes an already-decrypted secret + the
 * connection's non-secret `meta` and talks to the provider's REST API.
 *
 * Uses `fetch` only (no node-specific APIs) but is imported exclusively from
 * `"use node"` actions so decrypted secrets never leave the node runtime.
 */

export interface VerifyOk {
  /** A human label for the connection (shop/store name). */
  label?: string;
  /** Non-secret config to persist back onto the row (e.g. discovered shop id). */
  meta?: Record<string, unknown>;
}

const USER_AGENT = "setto-integrations";
const SHOPIFY_API_VERSION = "2024-10";

/** Normalize a Shopify store to its `xxx.myshopify.com` host (no scheme/path). */
export function shopifyDomain(meta: Record<string, unknown>): string {
  const raw = String(meta.domain ?? "").trim();
  if (!raw) throw new Error("Shopify store domain is required (xxx.myshopify.com)");
  const host = raw
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
  if (!host.includes(".")) throw new Error(`Invalid Shopify domain: ${raw}`);
  return host;
}

function shopifyApiVersion(meta: Record<string, unknown>): string {
  return String(meta.apiVersion ?? SHOPIFY_API_VERSION);
}

/** Authenticated Shopify Admin REST request. Returns parsed JSON. */
export async function shopifyFetch<T = unknown>(
  secret: string,
  meta: Record<string, unknown>,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const domain = shopifyDomain(meta);
  const version = shopifyApiVersion(meta);
  const url = `https://${domain}/admin/api/${version}/${path.replace(/^\//, "")}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": secret,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      res.status === 401 || res.status === 403
        ? "Shopify rejected the access token (check the token and store domain)."
        : `Shopify API error ${res.status}: ${body.slice(0, 200)}`,
    );
  }
  return (await res.json()) as T;
}

/** Authenticated Printify request. Returns parsed JSON. */
export async function printifyFetch<T = unknown>(
  secret: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `https://api.printify.com/v1/${path.replace(/^\//, "")}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      "User-Agent": USER_AGENT,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      res.status === 401
        ? "Printify rejected the access token."
        : `Printify API error ${res.status}: ${body.slice(0, 200)}`,
    );
  }
  return (await res.json()) as T;
}

/**
 * Authenticated Buffer request (new bearer-token API at developers.buffer.com).
 * NOTE: the exact base/endpoints are finalized in the Buffer slice against a
 * real token; kept here so `verify` has a working auth check.
 */
export async function bufferFetch<T = unknown>(
  secret: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `https://api.buffer.com/1/${path.replace(/^\//, "")}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      res.status === 401 || res.status === 403
        ? "Buffer rejected the access token."
        : `Buffer API error ${res.status}: ${body.slice(0, 200)}`,
    );
  }
  return (await res.json()) as T;
}

/** Verify a provider's credentials by hitting a cheap authenticated endpoint. */
export async function verifyProvider(
  provider: string,
  secret: string,
  meta: Record<string, unknown>,
): Promise<VerifyOk> {
  switch (provider) {
    case "shopify": {
      const { shop } = await shopifyFetch<{ shop: { name?: string } }>(
        secret,
        meta,
        "shop.json",
      );
      return {
        label: shop?.name ?? shopifyDomain(meta),
        meta: { ...meta, apiVersion: shopifyApiVersion(meta) },
      };
    }
    case "printify": {
      const shops = await printifyFetch<Array<{ id: number; title: string }>>(
        secret,
        "shops.json",
      );
      const shopId = (meta.shopId as number | undefined) ?? shops[0]?.id;
      return {
        label: shops[0]?.title ?? "Printify",
        meta: {
          ...meta,
          shopId,
          shops: shops.map((s) => ({ id: s.id, title: s.title })),
        },
      };
    }
    case "buffer": {
      const profiles = await bufferFetch<Array<{ service?: string }>>(
        secret,
        "profiles.json",
      );
      const count = Array.isArray(profiles) ? profiles.length : 0;
      return { label: `Buffer · ${count} channel${count === 1 ? "" : "s"}` };
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
