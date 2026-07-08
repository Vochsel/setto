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

/**
 * Mint a Shopify Admin API access token via the client-credentials grant.
 *
 * Since Jan 2026 the legacy "paste a permanent shpat_ token" custom-app flow is
 * gone — Dev Dashboard apps exchange the app's Client ID + Secret for a 24h
 * token (`expires_in: 86399`). We hold those app-level credentials in env
 * (SHOPIFY_CLIENT_ID / SHOPIFY_SECRET) and mint a fresh token per operation, so
 * there is no token to store or refresh. Only works when the app and the store
 * belong to the same Shopify organization.
 * See https://shopify.dev/docs/apps/build/dev-dashboard/get-api-access-tokens
 */
export async function shopifyAccessToken(
  meta: Record<string, unknown>,
): Promise<string> {
  const domain = shopifyDomain(meta);
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Shopify app credentials not configured (SHOPIFY_CLIENT_ID / SHOPIFY_SECRET).",
    );
  }
  const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      res.status === 401 || res.status === 403
        ? "Shopify rejected the app credentials (check SHOPIFY_CLIENT_ID/SHOPIFY_SECRET, the store domain, and that the Setto app is installed on this store)."
        : `Shopify token exchange failed (${res.status}): ${body.slice(0, 200)}`,
    );
  }
  const { access_token } = (await res.json()) as { access_token?: string };
  if (!access_token)
    throw new Error("Shopify token exchange returned no access_token.");
  return access_token;
}

/** Authenticated Shopify Admin REST request. Returns parsed JSON. */
export async function shopifyFetch<T = unknown>(
  meta: Record<string, unknown>,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const domain = shopifyDomain(meta);
  const version = shopifyApiVersion(meta);
  const token = await shopifyAccessToken(meta);
  const url = `https://${domain}/admin/api/${version}/${path.replace(/^\//, "")}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": token,
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
  meta: Record<string, unknown>,
  max?: number,
): Promise<ShopifyProduct[]> {
  const domain = shopifyDomain(meta);
  const version = shopifyApiVersion(meta);
  // Mint one token and reuse it across every page of the pagination loop.
  const token = await shopifyAccessToken(meta);
  const out: ShopifyProduct[] = [];
  let url:
    | string
    | null = `https://${domain}/admin/api/${version}/products.json?limit=250`;
  while (url) {
    const res: Response = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": token,
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
    }>(secret, `${path}${sep}limit=50&page=${page}`);
    out.push(...(body.data ?? []));
    if (max && out.length >= max) return out.slice(0, max);
    if (!body.last_page || (body.current_page ?? page) >= body.last_page) break;
    page++;
  }
  return out;
}

/**
 * Buffer uses a bearer-token GraphQL API at https://api.buffer.com. Public API
 * tokens are ONLY accepted here — the legacy REST host (api.bufferapp.com) and
 * the internal gateway (graph.buffer.com) both reject them. The URL can be
 * overridden per-connection via `meta.graphqlUrl`.
 *
 * Verified against a live token: `channels(input:{organizationId})` lists the
 * org's channels; `createPost(input)` returns a `PostActionPayload` union whose
 * error members each carry a `message`. Enum values are lowerCamelCase.
 */
const BUFFER_GRAPHQL_URL = "https://api.buffer.com";

export interface BufferChannel {
  id: string;
  name?: string;
  service?: string;
  type?: string;
  serviceId?: string;
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

/**
 * The token's Buffer organization id — cached in `meta` at connect time, else
 * resolved from the account's first organization. `channels` is org-scoped, so
 * every channel/post call needs it.
 */
export async function bufferOrganizationId(
  secret: string,
  meta: Record<string, unknown>,
): Promise<string> {
  const cached = meta.organizationId;
  if (typeof cached === "string" && cached) return cached;
  const data = await bufferGraphQL<{
    account?: { organizations?: Array<{ id: string }> };
  }>(secret, meta, `query { account { organizations { id name } } }`);
  const id = data.account?.organizations?.[0]?.id;
  if (!id) throw new Error("No Buffer organization found for this token.");
  return id;
}

/** List the connected social channels for the token's organization. */
export async function bufferChannels(
  secret: string,
  meta: Record<string, unknown>,
): Promise<BufferChannel[]> {
  const organizationId = await bufferOrganizationId(secret, meta);
  const data = await bufferGraphQL<{ channels?: BufferChannel[] }>(
    secret,
    meta,
    `query($input: ChannelsInput!) {
      channels(input: $input) { id name service type serviceId avatar }
    }`,
    { input: { organizationId } },
  );
  return data.channels ?? [];
}

type BufferPostResult = {
  __typename: string;
  message?: string;
  post?: { id?: string; status?: string };
};

/**
 * Per-channel `metadata` some services require. Instagram won't accept a post
 * without a `type` (post/reel/story) and `shouldShareToFeed`; we pick reel for
 * video, post for images, and always surface it in the feed. Other services
 * either need no metadata or accept the post as-is.
 */
function bufferMetadataFor(
  service: string | undefined,
  hasVideo: boolean,
): Record<string, unknown> | undefined {
  switch (service) {
    case "instagram":
      return {
        instagram: {
          type: hasVideo ? "reel" : "post",
          shouldShareToFeed: true,
        },
      };
    case "facebook":
      return { facebook: { type: hasVideo ? "reel" : "post" } };
    default:
      return undefined;
  }
}

/**
 * Create a post on one channel. With `dueAt` (ISO) it schedules for that time;
 * without, it posts now. `schedulingType: automatic` makes Buffer publish it
 * (vs. a mobile reminder). `service` drives the channel-specific `metadata`
 * (e.g. Instagram's required post type). Throws the typed error on failure.
 */
export async function bufferCreatePost(
  secret: string,
  meta: Record<string, unknown>,
  input: {
    channelId: string;
    service?: string;
    text: string;
    assets?: BufferAsset[];
    dueAt?: string;
  },
): Promise<{ id?: string; status?: string }> {
  const hasVideo = (input.assets ?? []).some((a) => a.video);
  const metadata = bufferMetadataFor(input.service, hasVideo);
  const postInput: Record<string, unknown> = {
    channelId: input.channelId,
    text: input.text,
    assets: input.assets ?? [],
    schedulingType: "automatic",
    ...(metadata ? { metadata } : {}),
    ...(input.dueAt
      ? { dueAt: input.dueAt, mode: "customScheduled" }
      : { mode: "shareNow" }),
  };
  const data = await bufferGraphQL<{ createPost?: BufferPostResult }>(
    secret,
    meta,
    `mutation($input: CreatePostInput!) {
      createPost(input: $input) {
        __typename
        ... on PostActionSuccess { post { id status } }
        ... on NotFoundError { message }
        ... on UnauthorizedError { message }
        ... on UnexpectedError { message }
        ... on RestProxyError { message }
        ... on LimitReachedError { message }
        ... on InvalidInputError { message }
      }
    }`,
    { input: postInput },
  );
  const result = data.createPost;
  if (!result) throw new Error("Buffer returned no result.");
  if (result.__typename !== "PostActionSuccess") {
    throw new Error(result.message ?? `Buffer error (${result.__typename})`);
  }
  return { id: result.post?.id, status: result.post?.status };
}

/** Verify a provider's credentials by hitting a cheap authenticated endpoint. */
export async function verifyProvider(
  provider: string,
  secret: string,
  meta: Record<string, unknown>,
): Promise<VerifyOk> {
  switch (provider) {
    case "shopify": {
      // Shopify auths via the env app credentials (minted inside shopifyFetch),
      // not the per-connection `secret` — that arg is unused for this provider.
      const { shop } = await shopifyFetch<{ shop: { name?: string } }>(
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
      const organizationId = await bufferOrganizationId(secret, meta);
      const channels = await bufferChannels(secret, { ...meta, organizationId });
      const count = channels.length;
      return {
        label: `Buffer · ${count} channel${count === 1 ? "" : "s"}`,
        meta: {
          ...meta,
          organizationId,
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
