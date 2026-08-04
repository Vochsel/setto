/**
 * The transport-agnostic MCP tool layer.
 *
 * Both MCP servers — the local stdio server (`apps/mcp`) and the remote HTTP
 * server mounted in the web app (`apps/web/app/api/mcp`) — build their tool
 * list and dispatch tool calls from here, so they expose *exactly* the same
 * surface. The only thing that differs between them is auth: each passes in its
 * own `Caller`, which knows how to invoke a Convex function as the right user
 * (file credentials for the CLI/stdio; a per-request bearer token for HTTP).
 *
 * ## Why this is a hand-written surface
 *
 * It used to be one tool per public Convex function — 150 of them, plus
 * `describe`/`call`. That is a faithful API and a bad tool list: a model
 * choosing between `shootLocations:reorder` and `videoProjects:patchClip` to
 * answer "photograph my new products" picks badly, and the list alone crowds
 * the context window.
 *
 * So the tools here are shaped around the job — a Shopify catalogue that needs
 * product imagery — not around the database. Products, models, locations,
 * gallery, generate, sync, flows. The full 150-function surface is still one
 * `describe`/`call` away for anything unusual, but it no longer competes for
 * attention with the tools that matter.
 *
 * `search` + `fetch` remain because ChatGPT Deep Research requires exactly
 * those two names.
 */
import {
  manifest,
  signature,
  byDomain,
  domains,
  findFn,
  type FnSpec,
} from "./manifest";

export const SERVER_NAME = "setto";
export const SERVER_VERSION = "0.2.0";

/** MCP tool names can't contain ":", so we map "campaigns:list" <-> "campaigns__list". */
const SEP = "__";
export const toToolName = (path: string): string => path.replace(":", SEP);
export const toPath = (name: string): string => name.replace(SEP, ":");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Json;
}

/** Runs a Convex function by path as the authenticated caller. */
export type Caller = (
  path: string,
  args: Record<string, unknown>,
) => Promise<unknown>;

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Json;
  isError?: boolean;
}

/* ────────────────────────── schema helpers ────────────────────────── */

const S = {
  str: (description: string) => ({ type: "string", description }),
  num: (description: string) => ({ type: "number", description }),
  bool: (description: string) => ({ type: "boolean", description }),
  enum: (values: string[], description: string) => ({
    type: "string",
    enum: values,
    description,
  }),
  arr: (description: string) => ({
    type: "array",
    items: { type: "string" },
    description,
  }),
};

const object = (
  properties: Record<string, Json>,
  required: string[] = [],
): Json => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
});

/* ────────────────────────── the tools ────────────────────────── */

/**
 * Default image model for anything generated through MCP.
 *
 * Deliberately the cheap tier: an agent asked to "shoot the new arrivals" will
 * happily fan out dozens of images, and the cost difference between tiers is
 * ~8x. Callers who want the good one pass `modelKey` explicitly, and
 * `list_image_models` shows what that costs.
 */
export const MCP_DEFAULT_MODEL_KEY = "openai/gpt-image-2-low";

const TOOLS: McpTool[] = [
  {
    name: "list_products",
    description:
      "List products in the library (Shopify-synced or hand-made), with image URLs, variants and how many photos each already has. Filter with { query, source: 'shopify'|'manual', shotStatus: 'unshot' } — 'unshot' is how you find what still needs photography.",
    inputSchema: object({
      query: S.str("free-text match on name, description, category or handle"),
      source: S.enum(["shopify", "manual"], "where the product came from"),
      shotStatus: S.enum(
        ["any", "shot", "unshot"],
        "'unshot' = no generated images yet",
      ),
      limit: S.num("max products to return (default all)"),
    }),
  },
  {
    name: "get_product",
    description:
      "One product in full: description, prompt descriptor, every variant with its own images, and the Shopify handle/URL if it came from a store.",
    inputSchema: object({ id: S.str("product id") }, ["id"]),
  },
  {
    name: "list_models",
    description:
      "The people available to wear products, with their reference image URLs. Pass a model's id to generate_product_shot or wire it into a flow.",
    inputSchema: object({}),
  },
  {
    name: "list_locations",
    description:
      "Saved locations (each with Street View / place reference images) that a product shot can be set in.",
    inputSchema: object({}),
  },
  {
    name: "gallery",
    description:
      "Generated images and videos, newest first, with URLs. Filter by { productId, modelId, locationId, flowId }, { favouritesOnly: true }, { minRating: 4 }, or { kind: 'image'|'video' }. This is the shortlist of what's worth publishing.",
    inputSchema: object({
      productId: S.str("only images of this product"),
      modelId: S.str("only images of this person"),
      locationId: S.str("only images at this location"),
      flowId: S.str("only images produced by this flow"),
      favouritesOnly: S.bool("only favourited items"),
      minRating: S.num("only items rated at least this many stars (1-5)"),
      kind: S.enum(["image", "video"], "restrict to one media kind"),
      limit: S.num("max items (default 50)"),
    }),
  },
  {
    name: "generate_product_shot",
    description:
      "Generate photos of a product — optionally on a specific person and at a specific location. Costs money per image; call with { estimateOnly: true } first if the count is large. Returns generation ids; poll `gallery` for the finished URLs.",
    inputSchema: object(
      {
        productId: S.str("product to photograph"),
        variantId: S.str("specific variant (colourway); omit for the base product"),
        modelId: S.str("person to wear it"),
        locationId: S.str("where to set the shot"),
        prompt: S.str("extra art direction, e.g. 'walking, looking away, golden hour'"),
        count: S.num("images to generate (1-6, default 1)"),
        modelKey: S.str(
          `image model to use (see list_image_models); default ${MCP_DEFAULT_MODEL_KEY}`,
        ),
        aspectRatio: S.str("e.g. '4:5', '1:1', '16:9'"),
        estimateOnly: S.bool("return the cost estimate without generating"),
      },
      ["productId"],
    ),
  },
  {
    name: "shot_brief",
    description:
      "Build the prompt and reference image URLs for a product shot WITHOUT generating it — free. Use this when you can generate images yourself (ChatGPT, say): take the returned prompt + reference images, produce the image, then send it back with import_image so it lands in the gallery.",
    inputSchema: object(
      {
        productId: S.str("product to photograph"),
        variantId: S.str("specific variant"),
        modelId: S.str("person to wear it"),
        locationId: S.str("where to set the shot"),
        prompt: S.str("extra art direction"),
      },
      ["productId"],
    ),
  },
  {
    name: "import_image",
    description:
      "File an image you generated elsewhere into the library, tagged to a product / model / location so it shows up in that product's gallery. Pass a fetchable { url } or inline { dataUrl }.",
    inputSchema: object({
      url: S.str("image URL to fetch"),
      dataUrl: S.str("or the image inline, as a data: URL or base64"),
      productId: S.str("product this shows"),
      variantId: S.str("variant this shows"),
      modelId: S.str("person in it"),
      locationId: S.str("where it is"),
      prompt: S.str("the prompt it was made from, for the record"),
      source: S.str("who generated it, e.g. 'chatgpt'"),
    }),
  },
  {
    name: "sync_shopify",
    description:
      "Pull the connected Shopify store's catalogue into the product library — new products are created, existing ones updated in place, variants become variants. Returns what changed, including which products are newly imported (the ones to photograph next). Use { preview: true } to see what would come in without writing.",
    inputSchema: object({
      preview: S.bool("list the store's products without importing"),
      limit: S.num("max products to pull"),
    }),
  },
  {
    name: "list_flows",
    description:
      "List saved flows — reusable shot templates wiring products, models and locations into an output. Run one with run_flow to re-shoot a product the same way every time.",
    inputSchema: object({}),
  },
  {
    name: "run_flow",
    description:
      "Run a flow. Override its products with { productIds } to apply the same template to a new arrival, or { allVariants: true } to cover every colourway. ALWAYS call with { dryRun: true } first for large runs — it returns the image count and cost. Use { mode: 'brief' } to get prompts + reference images instead of generating (free).",
    inputSchema: object(
      {
        flowId: S.str("flow to run"),
        productIds: S.arr("run the template against these products instead"),
        allVariants: S.bool("expand every variant of each product"),
        modelKey: S.str("override the image model"),
        aspectRatio: S.str("override the aspect ratio"),
        count: S.num("images per combination (1-6)"),
        maxImages: S.num("raise or lower the cap for this run"),
        mode: S.enum(
          ["render", "brief"],
          "'render' generates; 'brief' returns prompts + references, free",
        ),
        dryRun: S.bool("report the count and cost without doing anything"),
      },
      ["flowId"],
    ),
  },
  {
    name: "list_image_models",
    description:
      "The image models available for generating, with per-image prices, so you can pick a tier deliberately.",
    inputSchema: object({}),
  },
  {
    name: "describe",
    description:
      "Escape hatch: list the full setto function surface (all ~150 functions, their types and argument schemas) for anything the curated tools above don't cover. Optional { domain } filter, e.g. 'campaigns'.",
    inputSchema: object({ domain: S.str("e.g. campaigns, shoots, videos") }),
  },
  {
    name: "call",
    description:
      "Escape hatch: call any setto function by path, e.g. { path: 'shoots:list', args: {} }. Use `describe` first to find paths and argument shapes.",
    inputSchema: object(
      {
        path: S.str("function path, e.g. shoots:list"),
        args: { type: "object", description: "arguments object" },
      },
      ["path"],
    ),
  },
  {
    name: "search",
    description:
      "Search across your setto data (products, models, locations, shoots, campaigns, …). Returns { id, title, url }; pass an id to `fetch`. Required by ChatGPT Deep Research.",
    inputSchema: object({ query: S.str("free-text search query") }, ["query"]),
  },
  {
    name: "fetch",
    description:
      "Fetch one setto record by the id returned from `search` (e.g. 'outfits:<id>'). Required by ChatGPT Deep Research.",
    inputSchema: object({ id: S.str("record id from `search`") }, ["id"]),
  },
];

export function listTools(): McpTool[] {
  return TOOLS;
}

/* ────────────────────────── skills (MCP prompts) ────────────────────────── */

/**
 * Skills are exposed as MCP prompts: named, argument-taking playbooks a client
 * can offer by name ("/setto:new-product-shoot"). They encode the order of
 * operations — sync, then find what's unshot, then estimate, then generate —
 * which is exactly the part a model gets wrong when handed tools alone.
 */
export interface McpPrompt {
  name: string;
  description: string;
  arguments: { name: string; description: string; required?: boolean }[];
  /** Rendered with the call's arguments substituted. */
  template: (args: Record<string, string>) => string;
}

const need = (args: Record<string, string>, key: string, fallback: string) =>
  args[key]?.trim() || fallback;

export const PROMPTS: McpPrompt[] = [
  {
    name: "shoot-new-products",
    description:
      "Sync Shopify, find products with no photos yet, and shoot them — with a cost check before spending anything.",
    arguments: [
      {
        name: "look",
        description: "art direction for the shots, e.g. 'sunny street style'",
      },
      { name: "limit", description: "how many products to cover (default 5)" },
    ],
    template: (a) => `Photograph the products that don't have images yet.

1. Call sync_shopify to pull anything new from the store. Report what came in.
2. Call list_products { shotStatus: "unshot", limit: ${need(a, "limit", "5")} }.
   If nothing comes back, say so and stop — don't invent work.
3. Call list_models and list_locations, and pick a person and a place that suit
   the products. Say which you picked and why.
4. For ONE product first, call generate_product_shot { estimateOnly: true } to
   show the cost. Wait for the user to approve before generating anything.
5. On approval, generate that product, then the rest.
6. Finish with gallery { limit: 20 } and list the image URLs.

Art direction: ${need(a, "look", "clean, natural, true to the product")}`,
  },
  {
    name: "variant-sweep",
    description:
      "Shoot every colourway/variant of one product consistently, using a saved flow when there is one.",
    arguments: [
      { name: "product", description: "product name or id", required: true },
    ],
    template: (a) => `Shoot every variant of "${need(a, "product", "the product")}".

1. list_products { query: "${need(a, "product", "")}" } to find it. Confirm the
   match before spending anything, and report its variant count.
2. Check list_flows for a template that already fits. If one does, use
   run_flow { flowId, productIds: [<id>], allVariants: true, dryRun: true } and
   show the count and cost.
3. Otherwise call generate_product_shot per variant, with the same model,
   location and art direction across all of them — consistency is the point.
4. Report the estimated cost and wait for approval before generating.
5. Afterwards, show the gallery for that product so the variants can be compared
   side by side.`,
  },
  {
    name: "generate-with-your-own-images",
    description:
      "Use your own image generation instead of paying for ours: fetch briefs, generate, then file the results back.",
    arguments: [
      { name: "product", description: "product name or id", required: true },
      { name: "count", description: "how many images (default 3)" },
    ],
    template: (a) => `Produce images for "${need(a, "product", "the product")}" using your own image generation, at no cost to the setto account.

1. list_products { query: "${need(a, "product", "")}" } to find the product.
2. Call shot_brief for each shot you want (vary model/location/direction). Each
   returns a prompt plus reference image URLs — the product, the person, the place.
3. Generate each image yourself from that prompt and those references. Follow the
   prompt's instruction to compose a new photograph rather than editing a reference.
4. Send each result back with import_image { url or dataUrl, productId, modelId,
   locationId, source: "chatgpt" } so it lands in the product's gallery.
5. Show the gallery for that product when you're done.

Make ${need(a, "count", "3")} images.`,
  },
  {
    name: "pick-the-keepers",
    description:
      "Review a product's images and favourite the ones worth publishing.",
    arguments: [
      { name: "product", description: "product name or id", required: true },
    ],
    template: (a) => `Review the photos of "${need(a, "product", "the product")}" and mark the keepers.

1. Find the product with list_products, then call
   gallery { productId: <id>, limit: 50 }.
2. Look at the images. For each, judge it as product photography: is the product
   clearly readable, is the framing usable, does anything look wrong (hands,
   fabric, text)?
3. Favourite the ones worth publishing with
   call { path: "review:toggleFavorite", args: { id: <generation id> } }, and
   rate the rest with review:setReview.
4. Summarise: how many kept, what the rejects had in common, and what art
   direction would fix it next time.`,
  },
];

export function listPrompts() {
  return PROMPTS.map((p) => ({
    name: p.name,
    description: p.description,
    arguments: p.arguments,
  }));
}

export function getPrompt(name: string, args: Record<string, string> = {}) {
  const prompt = PROMPTS.find((p) => p.name === name);
  if (!prompt) throw new Error(`Unknown prompt: ${name}`);
  return {
    description: prompt.description,
    messages: [
      {
        role: "user" as const,
        content: { type: "text" as const, text: prompt.template(args) },
      },
    ],
  };
}

/* ────────────────────────── dispatch ────────────────────────── */

function text(data: unknown): ToolResult {
  const body =
    typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text", text: body }] };
}

function structured(data: Json): ToolResult {
  return { ...text(data), structuredContent: data };
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/** Drop undefined keys — Convex validators reject unknown/undefined fields. */
function clean(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

/* ── Deep Research search/fetch, generically over the manifest ─────────────
 *
 * A domain is searchable when it has a no-required-arg `list` and a `get` that
 * takes an `id`. We list each such domain, substring-match the query against the
 * record JSON, and return `{ id: "<domain>:<_id>", title, url }`. `fetch` walks
 * that back to `<domain>:get { id }`.
 */
function listFn(domain: string): FnSpec | undefined {
  return byDomain(domain).find((f) => f.path === `${domain}:list`);
}

function hasNoRequiredArgs(fn: FnSpec): boolean {
  const v = fn.args;
  if (!v || v.type !== "object") return true;
  return Object.values(v.value ?? {}).every(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (f) => (f as any)?.optional === true,
  );
}

function getFnTakesId(domain: string): boolean {
  const fn = findFn(`${domain}:get`);
  if (!fn || fn.args?.type !== "object") return false;
  return Boolean(fn.args.value?.id);
}

/** Domains that support generic search + fetch. */
export function searchableDomains(): string[] {
  return domains().filter((d) => {
    const list = listFn(d);
    return Boolean(list) && hasNoRequiredArgs(list as FnSpec) && getFnTakesId(d);
  });
}

function titleOf(domain: string, doc: Record<string, unknown>): string {
  for (const key of ["name", "title", "label", "headline"]) {
    const val = doc[key];
    if (typeof val === "string" && val.trim()) return val;
  }
  return `${domain} ${String(doc._id ?? "")}`.trim();
}

function recordUrl(
  webUrl: string | undefined,
  domain: string,
  id: string,
): string | undefined {
  if (!webUrl) return undefined;
  return `${webUrl.replace(/\/$/, "")}/${domain}/${id}`;
}

async function runSearch(
  query: string,
  caller: Caller,
  webUrl?: string,
): Promise<ToolResult> {
  const needle = query.trim().toLowerCase();
  const results: Array<{ id: string; title: string; url?: string }> = [];
  for (const domain of searchableDomains()) {
    let rows: unknown;
    try {
      rows = await caller(`${domain}:list`, {});
    } catch {
      continue; // domain not listable as this user; skip
    }
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const doc = row as Record<string, unknown>;
      const id = String(doc._id ?? "");
      if (!id) continue;
      const matches =
        !needle || JSON.stringify(doc).toLowerCase().includes(needle);
      if (!matches) continue;
      results.push({
        id: `${domain}:${id}`,
        title: titleOf(domain, doc),
        url: recordUrl(webUrl, domain, id),
      });
    }
  }
  return structured({ results });
}

async function runFetch(
  recordId: string,
  caller: Caller,
  webUrl?: string,
): Promise<ToolResult> {
  const sep = recordId.indexOf(":");
  if (sep < 0)
    throw new Error(`Invalid id (expected "<domain>:<id>"): ${recordId}`);
  const domain = recordId.slice(0, sep);
  const id = recordId.slice(sep + 1);
  if (!getFnTakesId(domain))
    throw new Error(`Domain "${domain}" does not support fetch.`);
  const doc = (await caller(`${domain}:get`, { id })) as Record<
    string,
    unknown
  > | null;
  if (!doc) throw new Error(`Not found: ${recordId}`);
  return structured({
    id: recordId,
    title: titleOf(domain, doc),
    text: JSON.stringify(doc, null, 2),
    url: recordUrl(webUrl, domain, id),
    metadata: { domain },
  });
}

/* ── product-shot helpers shared by generate_product_shot and shot_brief ── */

type ShotArgs = {
  outfitId: string;
  variationId?: string;
  modelId?: string;
  locationId?: string;
  extraPrompt?: string;
};

function shotArgsFrom(args: Record<string, unknown>): ShotArgs {
  const outfitId = str(args.productId);
  if (!outfitId) throw new Error("productId is required");
  return clean({
    outfitId,
    variationId: str(args.variantId),
    modelId: str(args.modelId),
    locationId: str(args.locationId),
    extraPrompt: str(args.prompt),
  }) as ShotArgs;
}

/** Per-image price for a model key, read from the live registry via Convex. */
async function priceOf(caller: Caller, modelKey: string): Promise<number> {
  const models = (await caller("settings:imageModels", {})) as
    | { id: string; pricePerImage: number }[]
    | undefined;
  return models?.find((m) => m.id === modelKey)?.pricePerImage ?? 0;
}

/**
 * Dispatch an MCP tool call. `caller` runs Convex functions as the
 * authenticated user; `webUrl` (optional) is used to build record links for
 * search/fetch results.
 */
export async function callTool(
  name: string,
  args: Record<string, unknown>,
  caller: Caller,
  opts: { webUrl?: string } = {},
): Promise<ToolResult> {
  switch (name) {
    /* ── library ── */
    case "list_products":
      return structured(
        await caller(
          "products:list",
          clean({
            query: str(args.query),
            source: str(args.source),
            shotStatus: str(args.shotStatus),
            limit: num(args.limit),
          }),
        ),
      );

    case "get_product":
      return structured(await caller("products:get", { id: str(args.id) }));

    case "list_models":
      return structured(await caller("models:list", {}));

    case "list_locations":
      return structured(await caller("locations:list", {}));

    case "list_image_models":
      return structured(await caller("settings:imageModels", {}));

    /* ── gallery ── */
    case "gallery":
      return structured(
        await caller(
          "review:feed",
          clean({
            outfitId: str(args.productId),
            modelId: str(args.modelId),
            locationId: str(args.locationId),
            flowId: str(args.flowId),
            favoritesOnly:
              typeof args.favouritesOnly === "boolean"
                ? args.favouritesOnly
                : undefined,
            minRating: num(args.minRating),
            kind: str(args.kind),
            limit: num(args.limit) ?? 50,
          }),
        ),
      );

    /* ── generating ── */
    case "generate_product_shot": {
      const shot = shotArgsFrom(args);
      const count = Math.max(1, Math.min(6, Math.round(num(args.count) ?? 1)));
      const modelKey = str(args.modelKey) ?? MCP_DEFAULT_MODEL_KEY;
      const unit = await priceOf(caller, modelKey);
      const estimate = {
        images: count,
        modelKey,
        unitCostUsd: unit,
        estimatedCostUsd: Math.round(unit * count * 1000) / 1000,
      };
      if (args.estimateOnly === true) {
        return structured({ ...estimate, generated: false });
      }
      const result = (await caller("generate:generateQuick", {
        mode: "prompt",
        ...shot,
        count,
        modelKey,
        ...clean({ aspectRatio: str(args.aspectRatio) }),
      })) as { generationIds?: string[] };
      return structured({
        ...estimate,
        generated: true,
        generationIds: result?.generationIds ?? [],
        note: "Images are generating asynchronously — call `gallery` in a moment for the finished URLs.",
      });
    }

    case "shot_brief":
      return structured(await caller("products:shotBrief", shotArgsFrom(args)));

    case "import_image":
      return structured(
        await caller(
          "generate:importImage",
          clean({
            url: str(args.url),
            dataUrl: str(args.dataUrl),
            outfitId: str(args.productId),
            variationId: str(args.variantId),
            modelId: str(args.modelId),
            locationId: str(args.locationId),
            prompt: str(args.prompt),
            source: str(args.source) ?? "mcp",
          }),
        ),
      );

    /* ── store ── */
    case "sync_shopify": {
      const limit = num(args.limit);
      if (args.preview === true) {
        const [products, existing] = await Promise.all([
          caller("shopify:products", clean({ limit })) as Promise<
            { externalId: string; title: string }[]
          >,
          caller("products:externalIds", {}) as Promise<
            { externalId: string }[]
          >,
        ]);
        const known = new Set(existing.map((e) => e.externalId));
        return structured({
          preview: true,
          total: products.length,
          newProducts: products.filter((p) => !known.has(p.externalId)),
          alreadyImported: products.filter((p) => known.has(p.externalId)).length,
        });
      }
      const before = (await caller("products:externalIds", {})) as {
        externalId: string;
      }[];
      const known = new Set(before.map((e) => e.externalId));
      const result = await caller("shopify:sync", clean({ limit }));
      const after = (await caller("products:externalIds", {})) as {
        externalId: string;
        _id: string;
        name: string;
      }[];
      return structured({
        ...(result as object),
        newlyImported: after.filter((p) => !known.has(p.externalId)),
        note: "Newly imported products have no photos yet — list_products { shotStatus: 'unshot' } to find them.",
      });
    }

    /* ── flows ── */
    case "list_flows":
      return structured(await caller("flows:list", {}));

    case "run_flow":
      return structured(
        await caller(
          "flows:run",
          clean({
            flowId: str(args.flowId),
            productIds: Array.isArray(args.productIds)
              ? (args.productIds as unknown[]).map(String)
              : undefined,
            allVariants:
              typeof args.allVariants === "boolean" ? args.allVariants : undefined,
            modelKey: str(args.modelKey),
            aspectRatio: str(args.aspectRatio),
            count: num(args.count),
            maxImages: num(args.maxImages),
            mode: str(args.mode),
            dryRun: typeof args.dryRun === "boolean" ? args.dryRun : undefined,
          }),
        ),
      );

    /* ── escape hatches ── */
    case "describe": {
      const domain = str(args.domain);
      return text(
        domain
          ? byDomain(domain).map((fn) => signature(fn))
          : { domains: domains(), functions: manifest.map(signature) },
      );
    }

    case "call": {
      const path = String(args.path ?? "");
      const callArgs = (args.args ?? {}) as Record<string, unknown>;
      return text(await caller(path, callArgs));
    }

    case "search":
      return runSearch(String(args.query ?? ""), caller, opts.webUrl);

    case "fetch":
      return runFetch(String(args.id ?? ""), caller, opts.webUrl);
  }

  // Legacy: the old surface exposed every function as "<domain>__<name>".
  // Anything still calling those keeps working.
  const path = toPath(name);
  if (findFn(path)) return text(await caller(path, args));
  throw new Error(`Unknown tool: ${name}`);
}
