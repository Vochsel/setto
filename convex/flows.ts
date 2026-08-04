/**
 * Flows — reusable product-shot templates.
 *
 * A flow is a small graph: product / model / location nodes wired into one or
 * more output nodes. Running it expands every connected combination into
 * generations, which is what makes "re-shoot this product", "shoot the new
 * drop", or "every variant of this one" a single call rather than a rebuilt
 * shoot. The graph is authored with xyflow on the web (`/flows/[id]`) and run
 * from the web, the CLI, or MCP.
 *
 * Two things keep a fan-out from being a footgun:
 *   - every run is *counted and costed first* (`estimate`), and
 *   - a run refuses to start past `maxImages` rather than silently truncating.
 *
 * `run` also has a `brief` mode that returns the assembled prompt + reference
 * images for each combination without generating anything. That's free, and it
 * lets a client that can already make images (ChatGPT, say) do the generating
 * and hand the result back via `generate:importImage`.
 */
import {
  action,
  mutation,
  query,
  internalQuery,
  internalMutation,
  type ActionCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { getScope, assertOrg } from "./lib/auth";
import { buildShotBrief, type ShotContext } from "./lib/shotAssembly";
import {
  getImageModel,
  estimateCost,
  DEFAULT_MODEL_ID,
} from "./lib/imageModels";
import { BASE_VARIATION_ID } from "./lib/prompt";

/** Ceiling on one run when the flow doesn't set its own. */
export const DEFAULT_MAX_IMAGES = 20;
/** Hard ceiling — no flow may raise `maxImages` above this. */
const ABSOLUTE_MAX_IMAGES = 200;

/* ────────────────────────── graph shape ────────────────────────── */

/**
 * The runner's view of a node. The editor stores more (position, styling,
 * labels); anything not listed here is ignored, so the two can evolve apart.
 *
 *   product  { productId, variantIds?: string[] }  — variantIds empty => base only,
 *                                                    ["*"] => every variant
 *   model    { modelId }
 *   location { locationId }
 *   output   { modelKey?, aspectRatio?, count?, posePrompt?, clothingPrompt?,
 *              extraPrompt? }
 */
export interface FlowNode {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
}
export interface FlowEdge {
  id?: string;
  source: string;
  target: string;
}
export interface FlowGraph {
  nodes?: FlowNode[];
  edges?: FlowEdge[];
}

/** Sentinel in `variantIds` meaning "every variant this product has". */
export const ALL_VARIANTS = "*";

const asGraph = (raw: unknown): FlowGraph => {
  const g = (raw ?? {}) as FlowGraph;
  return { nodes: g.nodes ?? [], edges: g.edges ?? [] };
};

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

/** One image to generate: which product/variant, on whom, where. */
export interface Combination {
  outputNodeId: string;
  productId?: Id<"outfits">;
  variationId?: string;
  modelId?: Id<"models">;
  locationId?: Id<"locations">;
  modelKey: string;
  aspectRatio?: string;
  posePrompt?: string;
  clothingPrompt?: string;
  extraPrompt?: string;
  /** Which copy within this combination's `count`, for varying the framing. */
  index: number;
}

/**
 * Expand a graph into the list of images it describes.
 *
 * Each output node takes the cartesian product of the products, models and
 * locations wired into it. An empty category contributes a single "none" so a
 * product-only flow still produces one image per variant rather than zero.
 *
 * `overrides` is what makes a template reusable: point the flow at a different
 * product (a new arrival), or force every variant, without touching the graph.
 */
export function expandGraph(
  graph: FlowGraph,
  variantsByProduct: Map<string, string[]>,
  overrides: {
    productIds?: Id<"outfits">[];
    allVariants?: boolean;
    modelKey?: string;
    aspectRatio?: string;
    count?: number;
    defaultModelKey?: string;
    defaultAspectRatio?: string;
  } = {},
): Combination[] {
  const g = asGraph(graph);
  const byId = new Map((g.nodes ?? []).map((n) => [n.id, n]));
  const incoming = new Map<string, FlowNode[]>();
  for (const e of g.edges ?? []) {
    const src = byId.get(e.source);
    if (!src) continue;
    const list = incoming.get(e.target) ?? [];
    list.push(src);
    incoming.set(e.target, list);
  }

  const combos: Combination[] = [];
  const outputs = (g.nodes ?? []).filter((n) => n.type === "output");

  for (const out of outputs) {
    const sources = incoming.get(out.id) ?? [];
    const d = out.data ?? {};

    // Products, with their variants expanded. An override replaces the wired
    // products entirely — that's "run this template on the new product".
    const productNodes = sources.filter((n) => n.type === "product");
    const productSel: { id?: Id<"outfits">; variationId?: string }[] = [];
    const wanted: { id: Id<"outfits">; variantIds: string[] }[] =
      overrides.productIds?.length
        ? overrides.productIds.map((id) => ({
            id,
            variantIds: overrides.allVariants ? [ALL_VARIANTS] : [],
          }))
        : productNodes.flatMap((n) => {
            const id = str(n.data?.productId) as Id<"outfits"> | undefined;
            if (!id) return [];
            const raw = Array.isArray(n.data?.variantIds)
              ? (n.data!.variantIds as unknown[]).map(String)
              : [];
            return [{ id, variantIds: overrides.allVariants ? [ALL_VARIANTS] : raw }];
          });

    for (const p of wanted) {
      const all = variantsByProduct.get(p.id) ?? [];
      const ids = p.variantIds.includes(ALL_VARIANTS) ? all : p.variantIds;
      if (!ids.length) {
        productSel.push({ id: p.id }); // base product, no variation
      } else {
        for (const variationId of ids) {
          productSel.push({
            id: p.id,
            // The base sentinel means "the product as-is" — not a variation id.
            variationId:
              variationId === BASE_VARIATION_ID ? undefined : variationId,
          });
        }
      }
    }

    const models = sources
      .filter((n) => n.type === "model")
      .map((n) => str(n.data?.modelId) as Id<"models"> | undefined)
      .filter(Boolean) as Id<"models">[];
    const locations = sources
      .filter((n) => n.type === "location")
      .map((n) => str(n.data?.locationId) as Id<"locations"> | undefined)
      .filter(Boolean) as Id<"locations">[];

    // "No node of this kind" still contributes one slot, so partial graphs work.
    const productSlots = productSel.length ? productSel : [{}];
    const modelSlots: (Id<"models"> | undefined)[] = models.length
      ? models
      : [undefined];
    const locationSlots: (Id<"locations"> | undefined)[] = locations.length
      ? locations
      : [undefined];

    const count = Math.max(
      1,
      Math.min(6, Math.round(overrides.count ?? (Number(d.count) || 1))),
    );
    const modelKey =
      overrides.modelKey ??
      str(d.modelKey) ??
      overrides.defaultModelKey ??
      DEFAULT_MODEL_ID;
    const aspectRatio =
      overrides.aspectRatio ?? str(d.aspectRatio) ?? overrides.defaultAspectRatio;

    for (const product of productSlots) {
      for (const modelId of modelSlots) {
        for (const locationId of locationSlots) {
          for (let index = 0; index < count; index++) {
            combos.push({
              outputNodeId: out.id,
              productId: product.id,
              variationId: product.variationId,
              modelId,
              locationId,
              modelKey,
              aspectRatio,
              posePrompt: str(d.posePrompt),
              clothingPrompt: str(d.clothingPrompt),
              extraPrompt: str(d.extraPrompt),
              index,
            });
          }
        }
      }
    }
  }

  // A combination with nothing wired in at all would generate from a bare
  // prompt — almost certainly a half-built graph, so drop it.
  return combos.filter((c) => c.productId || c.modelId || c.locationId);
}

/* ────────────────────────── CRUD ────────────────────────── */

const summarize = (doc: Doc<"flows">) => {
  const g = asGraph(doc.graph);
  const count = (t: string) => (g.nodes ?? []).filter((n) => n.type === t).length;
  return {
    _id: doc._id,
    _creationTime: doc._creationTime,
    name: doc.name,
    description: doc.description,
    defaultModelKey: doc.defaultModelKey,
    defaultAspectRatio: doc.defaultAspectRatio,
    maxImages: doc.maxImages ?? DEFAULT_MAX_IMAGES,
    lastRunAt: doc.lastRunAt,
    nodes: {
      products: count("product"),
      models: count("model"),
      locations: count("location"),
      outputs: count("output"),
    },
  };
};

export const list = query({
  args: {},
  handler: async (ctx) => {
    const scope = await getScope(ctx);
    const rows = await ctx.db
      .query("flows")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .order("desc")
      .collect();
    return rows.filter((r) => !r.archived).map(summarize);
  },
});

export const get = query({
  args: { id: v.id("flows") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    const doc = assertOrg(await ctx.db.get(id), scope);
    return { ...doc, graph: asGraph(doc.graph) };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    graph: v.optional(v.any()),
    defaultModelKey: v.optional(v.string()),
    defaultAspectRatio: v.optional(v.string()),
    maxImages: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const scope = await getScope(ctx);
    return await ctx.db.insert("flows", {
      orgId: scope.orgId,
      createdBy: scope.userId,
      name: args.name,
      description: args.description,
      graph: asGraph(args.graph),
      defaultModelKey: args.defaultModelKey,
      defaultAspectRatio: args.defaultAspectRatio,
      maxImages: args.maxImages
        ? Math.min(ABSOLUTE_MAX_IMAGES, Math.max(1, Math.round(args.maxImages)))
        : undefined,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("flows"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    graph: v.optional(v.any()),
    defaultModelKey: v.optional(v.string()),
    defaultAspectRatio: v.optional(v.string()),
    maxImages: v.optional(v.number()),
    archived: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...patch }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    const clean: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(patch)) {
      if (val === undefined) continue;
      clean[k] = k === "graph" ? asGraph(val) : val;
    }
    if (typeof clean.maxImages === "number") {
      clean.maxImages = Math.min(
        ABSOLUTE_MAX_IMAGES,
        Math.max(1, Math.round(clean.maxImages as number)),
      );
    }
    await ctx.db.patch(id, clean);
    return { ok: true };
  },
});

export const remove = mutation({
  args: { id: v.id("flows") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    await ctx.db.delete(id);
    return { ok: true };
  },
});

export const duplicate = mutation({
  args: { id: v.id("flows"), name: v.optional(v.string()) },
  handler: async (ctx, { id, name }) => {
    const scope = await getScope(ctx);
    const doc = assertOrg(await ctx.db.get(id), scope);
    const { _id, _creationTime, lastRunAt, ...rest } = doc;
    void _id;
    void _creationTime;
    void lastRunAt;
    return await ctx.db.insert("flows", {
      ...rest,
      name: name ?? `${doc.name} copy`,
      createdBy: scope.userId,
    });
  },
});

/* ────────────────────── expansion + costing ────────────────────── */

/**
 * Resolve everything a run needs in one read: the flow, the variant ids of
 * every product it touches, and display names for the estimate breakdown.
 */
export const runContext = internalQuery({
  args: { orgId: v.string(), flowId: v.id("flows") },
  handler: async (ctx, { orgId, flowId }) => {
    const flow = await ctx.db.get(flowId);
    if (!flow || flow.orgId !== orgId) throw new Error("Flow not found");

    const g = asGraph(flow.graph);
    const productIds = new Set<string>();
    for (const n of g.nodes ?? []) {
      if (n.type === "product" && typeof n.data?.productId === "string") {
        productIds.add(n.data.productId);
      }
    }

    const names: Record<string, string> = {};
    const variants: Record<string, string[]> = {};
    for (const id of productIds) {
      const doc = await ctx.db.get(id as Id<"outfits">);
      if (!doc || doc.orgId !== orgId) continue;
      names[id] = doc.name;
      variants[id] = (doc.variations ?? []).map((x) => x.id);
    }
    return { flow, names, variants };
  },
});

/** Variant ids + name for products named in an override (not in the graph). */
export const productVariants = internalQuery({
  args: { orgId: v.string(), productIds: v.array(v.id("outfits")) },
  handler: async (ctx, { orgId, productIds }) => {
    const names: Record<string, string> = {};
    const variants: Record<string, string[]> = {};
    for (const id of productIds) {
      const doc = await ctx.db.get(id);
      if (!doc || doc.orgId !== orgId) throw new Error(`Product not found: ${id}`);
      names[id] = doc.name;
      variants[id] = (doc.variations ?? []).map((x) => x.id);
    }
    return { names, variants };
  },
});

const runOverrides = {
  productIds: v.optional(v.array(v.id("outfits"))),
  allVariants: v.optional(v.boolean()),
  modelKey: v.optional(v.string()),
  aspectRatio: v.optional(v.string()),
  count: v.optional(v.number()),
};

interface Plan {
  flow: Doc<"flows">;
  combos: Combination[];
  names: Record<string, string>;
}

/** Shared by estimate and run: expand the graph with any overrides applied. */
async function plan(
  ctx: ActionCtx,
  orgId: string,
  args: {
    flowId: Id<"flows">;
    productIds?: Id<"outfits">[];
    allVariants?: boolean;
    modelKey?: string;
    aspectRatio?: string;
    count?: number;
  },
): Promise<Plan> {
  const { flow, names, variants } = await ctx.runQuery(
    internal.flows.runContext,
    { orgId, flowId: args.flowId },
  );
  let allNames = names;
  const variantMap = new Map<string, string[]>(Object.entries(variants));
  if (args.productIds?.length) {
    const extra = await ctx.runQuery(internal.flows.productVariants, {
      orgId,
      productIds: args.productIds,
    });
    allNames = { ...names, ...extra.names };
    for (const [k, val] of Object.entries(extra.variants)) variantMap.set(k, val);
  }

  const combos = expandGraph(asGraph(flow.graph), variantMap, {
    productIds: args.productIds,
    allVariants: args.allVariants,
    modelKey: args.modelKey,
    aspectRatio: args.aspectRatio,
    count: args.count,
    defaultModelKey: flow.defaultModelKey,
    defaultAspectRatio: flow.defaultAspectRatio,
  });
  return { flow, combos, names: allNames };
}

function costOf(combos: Combination[]) {
  const perModel = new Map<string, number>();
  let total = 0;
  for (const c of combos) {
    total += estimateCost(c.modelKey);
    perModel.set(c.modelKey, (perModel.get(c.modelKey) ?? 0) + 1);
  }
  return {
    images: combos.length,
    estimatedCostUsd: Math.round(total * 1000) / 1000,
    byModel: [...perModel.entries()].map(([modelKey, images]) => ({
      modelKey,
      images,
      unitCostUsd: estimateCost(modelKey),
    })),
  };
}

/**
 * What would this run produce, and what would it cost? Always safe to call —
 * it reads and counts, nothing else.
 */
export const estimate = action({
  args: { flowId: v.id("flows"), ...runOverrides },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const scope = await getScope(ctx);
    const { flow, combos, names } = await plan(ctx, scope.orgId, args);
    const cost = costOf(combos);
    const cap = flow.maxImages ?? DEFAULT_MAX_IMAGES;
    return {
      flow: { _id: flow._id, name: flow.name },
      ...cost,
      maxImages: cap,
      withinCap: cost.images <= cap,
      breakdown: combos.slice(0, 50).map((c) => ({
        product: c.productId ? (names[c.productId] ?? c.productId) : undefined,
        variationId: c.variationId,
        modelId: c.modelId,
        locationId: c.locationId,
        modelKey: c.modelKey,
      })),
    };
  },
});

/* ────────────────────────── running ────────────────────────── */

/** Stamp the last-run time (internal: `run` is an action, it can't patch). */
export const markRun = internalMutation({
  args: { id: v.id("flows") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { lastRunAt: Date.now() });
  },
});

/**
 * Run a flow.
 *
 * `mode: "render"` queues the generations (the default). `mode: "brief"` returns
 * the prompt + reference images for each combination and generates nothing —
 * free, and the way to let a client with its own image model do the work, then
 * hand results back through `generate:importImage`.
 *
 * Refuses rather than truncates when the expansion exceeds the cap: a silently
 * shortened batch is worse than an error that tells you the real number.
 */
export const run = action({
  args: {
    flowId: v.id("flows"),
    mode: v.optional(v.union(v.literal("render"), v.literal("brief"))),
    dryRun: v.optional(v.boolean()),
    maxImages: v.optional(v.number()),
    ...runOverrides,
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const scope = await getScope(ctx);
    const { flow, combos, names } = await plan(ctx, scope.orgId, args);
    const cost = costOf(combos);
    const cap = Math.min(
      ABSOLUTE_MAX_IMAGES,
      args.maxImages ?? flow.maxImages ?? DEFAULT_MAX_IMAGES,
    );

    if (!combos.length) {
      throw new Error(
        "This flow expands to nothing — wire at least one product, model or location into an output node.",
      );
    }
    if (cost.images > cap) {
      throw new Error(
        `This run expands to ${cost.images} images (~$${cost.estimatedCostUsd}), over the cap of ${cap}. ` +
          `Raise maxImages, narrow the products/variants, or run it in parts.`,
      );
    }

    const mode = args.mode ?? "render";
    if (args.dryRun) {
      return { ...cost, mode, dryRun: true, flow: { _id: flow._id, name: flow.name } };
    }

    // One context read per distinct (product, variation, model, location) —
    // the same combination repeated for `count` reuses it.
    const contexts = new Map<string, ShotContext>();
    const keyOf = (c: Combination) =>
      [c.productId, c.variationId, c.modelId, c.locationId].join("|");
    for (const c of combos) {
      const key = keyOf(c);
      if (contexts.has(key)) continue;
      contexts.set(
        key,
        (await ctx.runQuery(internal.generations.quickContext, {
          orgId: scope.orgId,
          modelId: c.modelId,
          outfitId: c.productId,
          locationId: c.locationId,
          variationId: c.variationId,
        })) as ShotContext,
      );
    }

    const flowRunId = `${flow._id}:${Date.now()}`;
    const briefs: Record<string, unknown>[] = [];
    const generationIds: string[] = [];

    for (const c of combos) {
      const imageModel = getImageModel(c.modelKey);
      if (!imageModel) throw new Error(`Unknown model: ${c.modelKey}`);
      const context = contexts.get(keyOf(c))!;
      const brief = buildShotBrief({
        context,
        model: imageModel,
        direction: {
          posePrompt: c.posePrompt,
          clothingPrompt: c.clothingPrompt,
          extraPrompt: c.extraPrompt,
        },
        index: c.index,
      });

      if (mode === "brief") {
        briefs.push({
          product: c.productId ? (names[c.productId] ?? c.productId) : undefined,
          productId: c.productId,
          variationId: c.variationId,
          modelId: c.modelId,
          locationId: c.locationId,
          aspectRatio: c.aspectRatio,
          prompt: brief.prompt,
          referenceImageUrls: brief.referenceImageUrls,
        });
        continue;
      }

      const genId: Id<"generations"> = await ctx.runMutation(
        internal.generations.create,
        {
          orgId: scope.orgId,
          createdBy: scope.userId,
          flowId: flow._id,
          flowRunId,
          modelId: c.modelId,
          outfitId: c.productId,
          locationId: c.locationId,
          variationId: c.variationId,
          provider: imageModel.provider,
          modelKey: c.modelKey,
          modelLabel: imageModel.label,
          prompt: brief.prompt,
          negativePrompt: brief.negativePrompt,
        },
      );
      generationIds.push(genId);
      await ctx.scheduler.runAfter(0, internal.generate.runOne, {
        genId,
        modelKey: c.modelKey,
        prompt: brief.prompt,
        referenceImageUrls: brief.referenceImageUrls,
        aspectRatio: c.aspectRatio,
      });
    }

    await ctx.runMutation(internal.flows.markRun, { id: flow._id });

    return mode === "brief"
      ? { mode, images: briefs.length, briefs }
      : {
          mode,
          flowRunId,
          images: generationIds.length,
          estimatedCostUsd: cost.estimatedCostUsd,
          generationIds,
        };
  },
});

/** Images produced by a flow, newest first — "what did this template make?" */
export const runs = query({
  args: { flowId: v.id("flows"), limit: v.optional(v.number()) },
  handler: async (ctx, { flowId, limit }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(flowId), scope);
    const rows = await ctx.db
      .query("generations")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .order("desc")
      .collect();
    const mine = rows.filter((g) => g.flowId === flowId);
    const out = [];
    for (const g of mine.slice(0, limit ?? 60)) {
      let url = g.imageUrl;
      if (!url && g.storageId) {
        url = (await ctx.storage.getUrl(g.storageId)) ?? undefined;
      }
      out.push({
        _id: g._id,
        _creationTime: g._creationTime,
        flowRunId: g.flowRunId,
        status: g.status,
        url,
        thumbnailUrl: g.thumbnailUrl,
        outfitId: g.outfitId,
        variationId: g.variationId,
        modelId: g.modelId,
        locationId: g.locationId,
        favorite: g.favorite ?? false,
        rating: g.rating,
        error: g.error,
      });
    }
    return out;
  },
});
