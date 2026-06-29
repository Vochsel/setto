import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getScope, assertOrg } from "./lib/auth";

const presetType = v.union(
  v.literal("photography_style"),
  v.literal("camera_setup"),
  v.literal("lighting"),
);

export const list = query({
  args: { type: v.optional(presetType) },
  handler: async (ctx, { type }) => {
    const scope = await getScope(ctx);
    const rows = type
      ? await ctx.db
          .query("presets")
          .withIndex("by_org_type", (q) =>
            q.eq("orgId", scope.orgId).eq("type", type),
          )
          .collect()
      : await ctx.db
          .query("presets")
          .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
          .collect();
    return rows.filter((r) => !r.archived);
  },
});

export const create = mutation({
  args: {
    type: presetType,
    name: v.string(),
    description: v.optional(v.string()),
    promptDescriptor: v.optional(v.string()),
    params: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const scope = await getScope(ctx);
    return await ctx.db.insert("presets", {
      orgId: scope.orgId,
      createdBy: scope.userId,
      ...args,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("presets"),
    type: v.optional(presetType),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    promptDescriptor: v.optional(v.string()),
    params: v.optional(v.any()),
  },
  handler: async (ctx, { id, ...patch }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("presets") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    await ctx.db.delete(id);
  },
});

/** Succeeded renders whose shot used this preset (style/camera/lighting). */
export const usageRenders = query({
  args: { presetId: v.id("presets"), limit: v.optional(v.number()) },
  handler: async (ctx, { presetId, limit }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(presetId), scope);

    const shots = await ctx.db
      .query("shots")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .collect();
    const shotIds = shots
      .filter(
        (s) =>
          s.styleId === presetId ||
          s.cameraId === presetId ||
          s.lightingId === presetId,
      )
      .map((s) => s._id);
    if (!shotIds.length) return [];

    const gens = [];
    for (const sid of shotIds) {
      const g = await ctx.db
        .query("generations")
        .withIndex("by_shot", (q) => q.eq("shotId", sid))
        .collect();
      gens.push(...g);
    }
    gens.sort((a, b) => b._creationTime - a._creationTime);

    const max = limit ?? 8;
    const out: { _id: string; url: string }[] = [];
    for (const g of gens) {
      if (g.status !== "succeeded") continue;
      let u = g.imageUrl;
      if (!u && g.storageId) {
        u = (await ctx.storage.getUrl(g.storageId)) ?? undefined;
      }
      if (u) out.push({ _id: g._id, url: u });
      if (out.length >= max) break;
    }
    return out;
  },
});

/**
 * Seed a starter set of photography style / camera / lighting presets for a new
 * workspace. Idempotent-ish: only seeds when the workspace has no presets yet.
 */
export const seedDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const scope = await getScope(ctx);
    const existing = await ctx.db
      .query("presets")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .first();
    if (existing) return { seeded: false };

    const defaults: {
      type: "photography_style" | "camera_setup" | "lighting";
      name: string;
      description: string;
      promptDescriptor: string;
    }[] = [
      {
        type: "photography_style",
        name: "Editorial Fashion",
        description: "High-fashion magazine look",
        promptDescriptor:
          "high-fashion editorial photography, Vogue style, bold confident styling, refined color grading, shallow depth of field",
      },
      {
        type: "photography_style",
        name: "Street Documentary",
        description: "Candid, grounded, real",
        promptDescriptor:
          "candid street-style documentary photography, natural moment, authentic grain, true-to-life color",
      },
      {
        type: "photography_style",
        name: "Cinematic",
        description: "Film-still mood",
        promptDescriptor:
          "cinematic film still, anamorphic look, moody color grade, dramatic atmosphere, 35mm film texture",
      },
      {
        type: "camera_setup",
        name: "85mm Portrait",
        description: "Classic flattering portrait",
        promptDescriptor:
          "shot on a full-frame camera with an 85mm f/1.4 lens, creamy bokeh, eye-level, tight headroom",
      },
      {
        type: "camera_setup",
        name: "35mm Environmental",
        description: "Subject in context",
        promptDescriptor:
          "shot on a 35mm f/2 lens, environmental framing showing the location, slight wide perspective",
      },
      {
        type: "camera_setup",
        name: "Wide 24mm",
        description: "Dramatic, expansive",
        promptDescriptor:
          "shot on a 24mm wide-angle lens, low angle, dramatic perspective emphasizing the surroundings",
      },
      {
        type: "lighting",
        name: "Golden Hour",
        description: "Warm natural sun",
        promptDescriptor:
          "warm golden-hour sunlight, long soft shadows, glowing rim light",
      },
      {
        type: "lighting",
        name: "Softbox Studio",
        description: "Clean key + fill",
        promptDescriptor:
          "studio softbox lighting, soft key light with gentle fill, controlled even exposure",
      },
      {
        type: "lighting",
        name: "Overcast Diffused",
        description: "Flat, flattering",
        promptDescriptor:
          "soft overcast diffused daylight, even flattering light, no harsh shadows",
      },
    ];

    for (const d of defaults) {
      await ctx.db.insert("presets", {
        orgId: scope.orgId,
        createdBy: scope.userId,
        ...d,
      });
    }
    return { seeded: true, count: defaults.length };
  },
});
