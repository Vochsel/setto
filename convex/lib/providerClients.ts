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

export interface ShopifyImage {
  id: number;
  src: string;
  alt?: string | null;
}
export interface ShopifyVariant {
  id: number;
  title: string;
  price?: string;
  sku?: string;
  image_id?: number | null;
}
export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html?: string | null;
  product_type?: string | null;
  status?: string;
  updated_at?: string;
  images?: ShopifyImage[];
  variants?: ShopifyVariant[];
}

/**
 * List all products from a Shopify store, following REST cursor pagination
 * (the `Link` header). Stops at `max` products if given.
 */
export async function shopifyListProducts(
  secret: string,
  meta: Record<string, unknown>,
  max?: number,
): Promise<ShopifyProduct[]> {
  const domain = shopifyDomain(meta);
  const version = shopifyApiVersion(meta);
  const out: ShopifyProduct[] = [];
  let url:
    | string
    | null = `https://${domain}/admin/api/${version}/products.json?limit=250`;
  while (url) {
    const res: Response = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": secret,
        Accept: "application/json",
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
    const { products } = (await res.json()) as { products: ShopifyProduct[] };
    out.push(...products);
    if (max && out.length >= max) return out.slice(0, max);
    // Cursor pagination: the "next" page URL is in the Link header.
    const link = res.headers.get("link") ?? "";
    const next = /<([^>]+)>;\s*rel="next"/.exec(link);
    url = next ? next[1] : null;
  }
  return out;
}

/** Strip HTML tags + decode a few common entities from Shopify body_html. */
export function stripHtml(html?: string | null): string | undefined {
  if (!html) return undefined;
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
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

export interface PrintifyVariant {
  id: number;
  price?: number; // retail, minor units
  cost?: number; // production, minor units
  is_enabled?: boolean;
  title?: string;
}
export interface PrintifyProduct {
  id: number | string;
  title: string;
  visible?: boolean;
  images?: Array<{ src: string; is_default?: boolean }>;
  variants?: PrintifyVariant[];
}
export interface PrintifyOrder {
  id: string;
  status?: string;
  total_price?: number;
  total_shipping?: number;
  line_items?: Array<{ cost?: number; quantity?: number }>;
  shipments?: Array<{ carrier?: string; number?: string; url?: string; delivered_at?: string }>;
  address_to?: { country?: string; region?: string; city?: string };
  created_at?: string;
}

/**
 * Page through a Printify list endpoint. Printify returns
 * `{ data: [...], current_page, last_page }`; we walk pages until the last one
 * (or `max` items). Returns the flat `data` array.
 */
export async function printifyPaginate<T>(
  secret: string,
  path: string,
  max?: number,
): Promise<T[]> {
  const out: T[] = [];
  let page = 1;
  for (;;) {
    const sep = path.includes("?") ? "&" : "?";
    const body = await printifyFetch<{
      data: T[];
      current_page?: number;
      last_page?: number;
    }>(secret, `${path}${sep}limit=100&page=${page}`);
    out.push(...(body.data ?? []));
    if (max && out.length >= max) return out.slice(0, max);
    if (!body.last_page || (body.current_page ?? page) >= body.last_page) break;
    page++;
  }
  return out;
}

/**
 * Buffer (developers.buffer.com) uses a bearer-token GraphQL API. The gateway
 * URL can be overridden per-connection via `meta.graphqlUrl` so it can be
 * adjusted without a code change once validated against a live token.
 *
 * NOTE: Buffer's GraphQL schema (channels / createPost) is implemented here to
 * the published shape but not yet exercised against a real account — this is the
 * one provider path to confirm end-to-end with a token. All Buffer calls funnel
 * through `bufferGraphQL`, so any schema tweaks are localized to this section.
 */
const BUFFER_GRAPHQL_URL = "https://graph.buffer.com";

export interface BufferChannel {
  id: string;
  name?: string;
  service?: string;
  serviceType?: string;
  avatar?: string;
}
export interface BufferAsset {
  // Exactly one of image/video, each { url, thumbnailUrl? }.
  image?: { url: string; thumbnailUrl?: string };
  video?: { url: string; thumbnailUrl?: string };
}

function bufferEndpoint(meta: Record<string, unknown>): string {
  return String(meta.graphqlUrl ?? BUFFER_GRAPHQL_URL);
}

export async function bufferGraphQL<T>(
  secret: string,
  meta: Record<string, unknown>,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(bufferEndpoint(meta), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      res.status === 401 || res.status === 403
        ? "Buffer rejected the access token."
        : `Buffer API error ${res.status}: ${body.slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(`Buffer: ${json.errors[0].message}`);
  return json.data as T;
}

/** List the connected social channels for the token's account. */
export async function bufferChannels(
  secret: string,
  meta: Record<string, unknown>,
): Promise<BufferChannel[]> {
  const data = await bufferGraphQL<{ channels?: BufferChannel[] }>(
    secret,
    meta,
    `query { channels { id name service serviceType avatar } }`,
  );
  return data.channels ?? [];
}

/** Create/schedule a post on one channel. `dueAt` (ISO) schedules for later. */
export async function bufferCreatePost(
  secret: string,
  meta: Record<string, unknown>,
  input: {
    channelId: string;
    text: string;
    assets?: BufferAsset[];
    dueAt?: string;
  },
): Promise<{ id?: string; status?: string }> {
  const data = await bufferGraphQL<{ createPost?: { id?: string; status?: string } }>(
    secret,
    meta,
    `mutation($input: CreatePostInput!) { createPost(input: $input) { id status } }`,
    {
      input: {
        channelId: input.channelId,
        text: input.text,
        assets: input.assets ?? [],
        ...(input.dueAt
          ? { dueAt: input.dueAt, schedulingType: "AUTOMATIC", mode: "CUSTOM_SCHEDULED" }
          : {}),
      },
    },
  );
  return data.createPost ?? {};
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
      const channels = await bufferChannels(secret, meta);
      const count = channels.length;
      return {
        label: `Buffer · ${count} channel${count === 1 ? "" : "s"}`,
        meta: {
          ...meta,
          channels: channels.map((c) => ({
            id: c.id,
            name: c.name,
            service: c.service,
          })),
        },
      };
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
