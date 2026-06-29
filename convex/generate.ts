"use node";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { fal } from "@fal-ai/client";
import { buildPrompt, buildCreativePrompt } from "./lib/prompt";
import {
  getImageModel,
  buildFalInput,
  referenceGuidance,
  DEFAULT_MODEL_ID,
  type ImageModel,
} from "./lib/imageModels";

async function fetchAsBase64(
  url: string,
): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`reference fetch failed (${res.status})`);
  const mimeType = res.headers.get("content-type") ?? "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  return { data: buf.toString("base64"), mimeType };
}

/** OpenAI gpt-image-1. Uses /edits when references are supplied, else /generations. Returns base64 PNG. */
async function callOpenAI(
  model: ImageModel,
  apiKey: string,
  args: { prompt: string; referenceImageUrls: string[] },
): Promise<{ b64: string; mime: string }> {
  const size = model.openaiSize ?? "1024x1536";
  const quality = model.openaiQuality ?? "high";
  const useRefs = model.supportsImagePrompt && args.referenceImageUrls.length > 0;

  let res: Response;
  if (useRefs) {
    const form = new FormData();
    form.append("model", model.openaiModel ?? "gpt-image-1");
    form.append("prompt", args.prompt);
    form.append("size", size);
    form.append("quality", quality);
    form.append("n", "1");
    for (let i = 0; i < Math.min(args.referenceImageUrls.length, 6); i++) {
      const r = await fetch(args.referenceImageUrls[i]);
      if (!r.ok) continue;
      const blob = await r.blob();
      form.append("image[]", blob, `ref${i}.png`);
    }
    res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } else {
    res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model.openaiModel ?? "gpt-image-1",
        prompt: args.prompt,
        size,
        quality,
        n: 1,
      }),
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message ?? `OpenAI error ${res.status}`);
  }
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image");
  return { b64, mime: "image/png" };
}

/** Google Gemini 2.5 Flash Image ("nano banana"). Returns base64 image. */
async function callGoogle(
  model: ImageModel,
  apiKey: string,
  args: { prompt: string; referenceImageUrls: string[] },
): Promise<{ b64: string; mime: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = [{ text: args.prompt }];
  if (model.supportsImagePrompt) {
    for (const url of args.referenceImageUrls.slice(0, 6)) {
      try {
        const { data, mimeType } = await fetchAsBase64(url);
        parts.push({ inline_data: { mime_type: mimeType, data } });
      } catch {
        /* skip unreachable refs */
      }
    }
  }
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model.googleModel}:generateContent?key=${apiKey}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts }] }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message ?? `Gemini error ${res.status}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const outParts: any[] = json?.candidates?.[0]?.content?.parts ?? [];
  const imgPart = outParts.find(
    (p) => p?.inlineData?.data || p?.inline_data?.data,
  );
  const inline = imgPart?.inlineData ?? imgPart?.inline_data;
  if (!inline?.data) throw new Error("Gemini returned no image");
  return { b64: inline.data, mime: inline.mimeType ?? "image/png" };
}

function providerKey(provider: string): string | undefined {
  if (provider === "fal") return process.env.FAL_KEY;
  if (provider === "openai") return process.env.OPENAI_API_KEY;
  return process.env.GOOGLE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
}

function missingKeyMessage(provider: string): string {
  if (provider === "fal")
    return "FAL_KEY is not set. Run: npx convex env set FAL_KEY <key>";
  if (provider === "openai")
    return "OPENAI_API_KEY is not set. Run: npx convex env set OPENAI_API_KEY <key>";
  return "GOOGLE_AI_API_KEY is not set. Run: npx convex env set GOOGLE_AI_API_KEY <key>";
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Run a provider call and persist the result to Convex storage. */
async function generateAndStore(
  ctx: ActionCtx,
  model: ImageModel,
  apiKey: string,
  args: { prompt: string; referenceImageUrls: string[] },
): Promise<{ storageId: Id<"_storage">; url: string }> {
  if (model.provider === "fal") {
    fal.config({ credentials: apiKey });
    const input = buildFalInput(model, {
      prompt: args.prompt,
      referenceImageUrls: args.referenceImageUrls,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await fal.subscribe(model.falEndpoint!, { input });
    const data = result?.data ?? result;
    const imageUrl = data?.images?.[0]?.url ?? data?.image?.url ?? data?.url;
    if (!imageUrl) throw new Error("fal returned no image URL");
    const r = await fetch(imageUrl);
    if (!r.ok) throw new Error(`could not fetch generated image (${r.status})`);
    const blob = await r.blob();
    const storageId = await ctx.storage.store(blob);
    const url = (await ctx.storage.getUrl(storageId)) ?? imageUrl;
    return { storageId, url };
  }
  const out =
    model.provider === "openai"
      ? await callOpenAI(model, apiKey, args)
      : await callGoogle(model, apiKey, args);
  const blob = new Blob([Buffer.from(out.b64, "base64")], { type: out.mime });
  const storageId = await ctx.storage.store(blob);
  const url = (await ctx.storage.getUrl(storageId)) ?? "";
  return { storageId, url };
}

// Randomized scene directives for model variations — keeps the same person but
// varies pose, framing, mood and backdrop.
const VAR_POSES = [
  "standing relaxed with weight on one leg",
  "walking toward camera mid-stride",
  "leaning casually against a wall",
  "seated, relaxed posture",
  "three-quarter turn glancing over the shoulder",
  "hands in pockets, candid",
  "arms crossed, confident stance",
];
const VAR_EXPRESSIONS = [
  "soft neutral expression",
  "subtle smile",
  "serious editorial gaze",
  "laughing naturally",
  "contemplative look away from camera",
];
const VAR_ANGLES = [
  "eye-level full-body shot",
  "slight low angle",
  "high-angle three-quarter view",
  "waist-up portrait",
  "wide environmental shot",
];
const VAR_LIGHTS = [
  "soft overcast daylight",
  "warm golden-hour backlight",
  "dramatic side lighting",
  "bright studio softbox",
  "moody low-key lighting",
];
const VAR_SETTINGS = [
  "minimal seamless studio backdrop",
  "sunlit urban street",
  "industrial concrete interior",
  "lush green park",
  "neutral textured wall",
  "modern architectural space",
];

function randomModelScene(): string {
  const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];
  return `${pick(VAR_ANGLES)}, ${pick(VAR_POSES)}, ${pick(VAR_EXPRESSIONS)}, ${pick(VAR_LIGHTS)}, ${pick(VAR_SETTINGS)}.`;
}

/**
 * Generate one image per selected outfit variation for a shot (one-click batch),
 * routing to the chosen provider (fal / OpenAI / Google).
 */
export const generateShot = action({
  args: {
    shotId: v.id("shots"),
    modelKey: v.optional(v.string()),
    variationIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const userId = identity.subject;
    const orgId = (identity.org_id as string | undefined) ?? `user:${userId}`;

    const c = await ctx.runQuery(internal.generations.context, {
      shotId: args.shotId,
    });
    if (c.orgId !== orgId) throw new Error("Not found");

    const modelKey = args.modelKey ?? DEFAULT_MODEL_ID;
    const model = getImageModel(modelKey);
    if (!model) throw new Error(`Unknown model: ${modelKey}`);

    const variationIds = args.variationIds ?? c.shot.selectedVariationIds;
    const targets: (string | null)[] = variationIds.length
      ? variationIds
      : [null];

    // Create one row per variation and hand the slow provider call to a
    // scheduled job. This action returns immediately, so the user can fire
    // another batch (or move to another shot) without waiting for the images.
    const generationIds: string[] = [];
    for (const variationId of targets) {
      const variation = variationId
        ? (c.outfit?.variations.find((x) => x.id === variationId) ?? null)
        : null;

      const assembled = buildPrompt({
        shot: c.shot,
        model: c.model,
        outfit: c.outfit,
        variation,
        location: c.location,
        style: c.style,
        camera: c.camera,
        lighting: c.lighting,
        scheduledAt: c.scheduledAt,
        timezone: c.timezone,
      });

      // Reference images, ordered so the most important ones survive any
      // provider-side truncation: the exact outfit first (variation-specific
      // image if this is a variation, else the base outfit), then at least one
      // real "location shot", then the model's likeness, then extra context.
      const outfitImgs =
        (variation?.imageUrls?.length
          ? variation.imageUrls
          : c.outfit?.imageUrls) ?? [];
      const locationShots = [
        ...(c.location?.streetViewUrls ?? []),
        ...(c.location?.imageUrls ?? []),
      ];
      const modelImgs = c.model?.imageUrls ?? [];
      // Pick a *random* location shot each time so batches vary the backdrop
      // framing instead of always grounding on the same frame.
      const shuffledLoc = shuffle(locationShots);
      const references = Array.from(
        new Set([
          ...outfitImgs.slice(0, 2), // always send the outfit image
          ...shuffledLoc.slice(0, 1), // always send >=1 (random) location shot
          ...modelImgs.slice(0, 2), // subject likeness
          ...shuffledLoc.slice(1, 3), // extra location grounding
        ]),
      );
      // Nudge multi-image models to actually use the references (provider-aware).
      const promptText = references.length
        ? `${assembled.prompt}\n\n${referenceGuidance(model)}`
        : assembled.prompt;

      const genId = await ctx.runMutation(internal.generations.create, {
        orgId,
        createdBy: userId,
        shotId: args.shotId,
        shootId: c.shootId,
        variationId: variationId ?? undefined,
        provider: model.provider,
        modelKey,
        modelLabel: model.label,
        prompt: promptText,
        negativePrompt: assembled.negativePrompt,
      });
      generationIds.push(genId);

      await ctx.scheduler.runAfter(0, internal.generate.runOne, {
        genId,
        modelKey,
        prompt: promptText,
        referenceImageUrls: references,
      });
    }
    return { generationIds };
  },
});

/**
 * Execute a single queued generation against its provider and store the
 * result. Scheduled (one per variation) by `generateShot` so generations run
 * concurrently and never block the request.
 */
export const runOne = internalAction({
  args: {
    genId: v.id("generations"),
    modelKey: v.string(),
    prompt: v.string(),
    referenceImageUrls: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const model = getImageModel(args.modelKey);
    if (!model) {
      const error = `Unknown model: ${args.modelKey}`;
      await ctx.runMutation(internal.generations.attachResult, {
        id: args.genId,
        status: "failed",
        error,
      });
      await ctx.runMutation(internal.usage.recordForGeneration, {
        generationId: args.genId,
        status: "failed",
        error,
      });
      return;
    }

    const apiKey = providerKey(model.provider);
    if (!apiKey) {
      const error = missingKeyMessage(model.provider);
      await ctx.runMutation(internal.generations.attachResult, {
        id: args.genId,
        status: "failed",
        error,
      });
      await ctx.runMutation(internal.usage.recordForGeneration, {
        generationId: args.genId,
        status: "failed",
        error,
      });
      return;
    }

    try {
      if (model.provider === "fal") {
        fal.config({ credentials: apiKey });
        const input = buildFalInput(model, {
          prompt: args.prompt,
          referenceImageUrls: args.referenceImageUrls,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = await fal.subscribe(model.falEndpoint!, { input });
        const data = result?.data ?? result;
        const imageUrl = data?.images?.[0]?.url ?? data?.image?.url ?? data?.url;
        if (!imageUrl) throw new Error("fal returned no image URL");
        await ctx.runMutation(internal.generations.attachResult, {
          id: args.genId,
          status: "succeeded",
          imageUrl,
          seed: typeof data?.seed === "number" ? data.seed : undefined,
          falRequestId: result?.requestId,
        });
        await ctx.runMutation(internal.usage.recordForGeneration, {
          generationId: args.genId,
          status: "succeeded",
        });
      } else {
        const out =
          model.provider === "openai"
            ? await callOpenAI(model, apiKey, {
                prompt: args.prompt,
                referenceImageUrls: args.referenceImageUrls,
              })
            : await callGoogle(model, apiKey, {
                prompt: args.prompt,
                referenceImageUrls: args.referenceImageUrls,
              });
        const blob = new Blob([Buffer.from(out.b64, "base64")], {
          type: out.mime,
        });
        const storageId = await ctx.storage.store(blob);
        // Resolve the URL now and persist it so the UI never depends on a
        // query-time getUrl (which can briefly return null right after store).
        const imageUrl = (await ctx.storage.getUrl(storageId)) ?? undefined;
        await ctx.runMutation(internal.generations.attachResult, {
          id: args.genId,
          status: "succeeded",
          storageId,
          imageUrl,
        });
        await ctx.runMutation(internal.usage.recordForGeneration, {
          generationId: args.genId,
          status: "succeeded",
        });
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await ctx.runMutation(internal.generations.attachResult, {
        id: args.genId,
        status: "failed",
        error,
      });
      await ctx.runMutation(internal.usage.recordForGeneration, {
        generationId: args.genId,
        status: "failed",
        error,
      });
    }
  },
});

/**
 * Generate one or more ad creatives for a campaign. Builds an advertising
 * prompt from the brief + copy and conditions the image on the picked shoot
 * photos (hero imagery) and uploaded inspiration designs (style reference).
 * Returns immediately; each creative is produced by a scheduled worker.
 */
export const generateCreative = action({
  args: {
    campaignId: v.id("campaigns"),
    modelKey: v.optional(v.string()),
    count: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const userId = identity.subject;
    const orgId = (identity.org_id as string | undefined) ?? `user:${userId}`;

    const c = await ctx.runQuery(internal.campaigns.creativeContext, {
      id: args.campaignId,
    });
    if (c.orgId !== orgId) throw new Error("Not found");

    const modelKey = args.modelKey ?? DEFAULT_MODEL_ID;
    const model = getImageModel(modelKey);
    if (!model) throw new Error(`Unknown model: ${modelKey}`);

    const { prompt } = buildCreativePrompt({
      campaignName: c.name,
      brief: c.brief,
      copy: c.copy,
      aspectRatio: c.aspectRatio,
      shotCount: c.shotUrls.length,
      inspirationCount: c.inspirationUrls.length,
    });

    // Hero shots first (the subject), then inspiration (the look). Capped so we
    // stay within provider reference limits.
    const references = Array.from(
      new Set([...c.shotUrls.slice(0, 4), ...c.inspirationUrls.slice(0, 2)]),
    );

    const count = Math.min(Math.max(args.count ?? 1, 1), 4);
    const creativeIds: string[] = [];
    for (let i = 0; i < count; i++) {
      const creativeId = await ctx.runMutation(
        internal.campaignCreatives.create,
        {
          orgId,
          createdBy: userId,
          campaignId: args.campaignId,
          provider: model.provider,
          modelKey,
          modelLabel: model.label,
          prompt,
        },
      );
      creativeIds.push(creativeId);
      await ctx.scheduler.runAfter(0, internal.generate.runOneCreative, {
        creativeId,
        modelKey,
        prompt,
        referenceImageUrls: references,
      });
    }
    return { creativeIds };
  },
});

/** Background worker: run one queued campaign creative and store the result. */
export const runOneCreative = internalAction({
  args: {
    creativeId: v.id("campaignCreatives"),
    modelKey: v.string(),
    prompt: v.string(),
    referenceImageUrls: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const fail = async (error: string) => {
      await ctx.runMutation(internal.campaignCreatives.attachResult, {
        id: args.creativeId,
        status: "failed",
        error,
      });
      await ctx.runMutation(internal.usage.recordForCreative, {
        creativeId: args.creativeId,
        status: "failed",
        error,
      });
    };

    const model = getImageModel(args.modelKey);
    if (!model) return fail(`Unknown model: ${args.modelKey}`);

    const apiKey = providerKey(model.provider);
    if (!apiKey) return fail(missingKeyMessage(model.provider));

    try {
      const { storageId, url } = await generateAndStore(ctx, model, apiKey, {
        prompt: args.prompt,
        referenceImageUrls: args.referenceImageUrls,
      });
      await ctx.runMutation(internal.campaignCreatives.attachResult, {
        id: args.creativeId,
        status: "succeeded",
        storageId,
        imageUrl: url || undefined,
      });
      await ctx.runMutation(internal.usage.recordForCreative, {
        creativeId: args.creativeId,
        status: "succeeded",
      });
    } catch (e) {
      await fail(e instanceof Error ? e.message : String(e));
    }
  },
});

/**
 * Generate a single model reference image and store it. With no references it
 * produces a fresh portrait from the text description; with references it
 * produces a resemblance-preserving variation in a randomized scene. The image
 * is stored but NOT attached to any model — the caller decides whether to keep
 * it (approve/curate in the editor).
 */
export const generateModelImage = action({
  args: {
    prompt: v.optional(v.string()),
    referenceImageUrls: v.optional(v.array(v.string())),
    modelKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const userId = identity.subject;
    const orgId = (identity.org_id as string | undefined) ?? `user:${userId}`;

    const model =
      getImageModel(args.modelKey ?? DEFAULT_MODEL_ID) ??
      getImageModel(DEFAULT_MODEL_ID)!;
    const logUsage = (status: "succeeded" | "failed", error?: string) =>
      ctx.runMutation(internal.usage.record, {
        orgId,
        userId,
        kind: "model_portrait" as const,
        provider: model.provider,
        modelKey: model.id,
        modelLabel: model.label,
        status,
        error,
      });

    const apiKey = providerKey(model.provider);
    if (!apiKey) {
      await logUsage("failed", missingKeyMessage(model.provider));
      throw new Error(missingKeyMessage(model.provider));
    }

    const refs = (args.referenceImageUrls ?? []).filter(Boolean);
    const base = (args.prompt ?? "").trim();

    let prompt: string;
    if (refs.length) {
      prompt =
        "Photorealistic full-body fashion photograph of the exact same person " +
        "shown in the reference images — identical face, hair, skin tone and " +
        "body proportions. " +
        (base ? `${base}. ` : "") +
        `${randomModelScene()} Keep their identity and likeness perfectly ` +
        "consistent. " +
        referenceGuidance(model);
    } else {
      prompt =
        "Photorealistic studio reference photograph of a fashion model: " +
        (base || "an adult fashion model") +
        ". Neutral seamless background, soft even lighting, clear unobstructed " +
        "face, three-quarter to full body, natural skin texture, sharp focus, " +
        "no text or watermark.";
    }

    try {
      const out = await generateAndStore(ctx, model, apiKey, {
        prompt,
        referenceImageUrls: refs,
      });
      await logUsage("succeeded");
      return out;
    } catch (e) {
      await logUsage("failed", e instanceof Error ? e.message : String(e));
      throw e;
    }
  },
});

/**
 * Kick off N resemblance-preserving variations for an existing model in the
 * background. Returns immediately; each finished image is appended to the
 * model's reference set (the library updates reactively).
 */
export const generateModelVariations = action({
  args: {
    modelId: v.id("models"),
    count: v.optional(v.number()),
    modelKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const userId = identity.subject;
    const orgId = (identity.org_id as string | undefined) ?? `user:${userId}`;

    const model = await ctx.runQuery(api.models.get, { id: args.modelId });
    if (model.orgId !== orgId) throw new Error("Not found");

    const refs = (model.imageUrls ?? [])
      .map((u) => u.url)
      .filter(Boolean) as string[];
    const count = Math.min(Math.max(args.count ?? 1, 1), 4);
    const modelKey = args.modelKey ?? DEFAULT_MODEL_ID;

    for (let i = 0; i < count; i++) {
      await ctx.scheduler.runAfter(0, internal.generate.runModelVariation, {
        orgId,
        userId,
        modelId: args.modelId,
        modelKey,
        prompt: model.promptDescriptor ?? model.name,
        referenceImageUrls: refs,
      });
    }
    return { scheduled: count };
  },
});

/** Background worker: generate one model variation and append it. */
export const runModelVariation = internalAction({
  args: {
    orgId: v.string(),
    userId: v.string(),
    modelId: v.id("models"),
    modelKey: v.string(),
    prompt: v.optional(v.string()),
    referenceImageUrls: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const model =
      getImageModel(args.modelKey) ?? getImageModel(DEFAULT_MODEL_ID)!;
    const logUsage = (status: "succeeded" | "failed", error?: string) =>
      ctx.runMutation(internal.usage.record, {
        orgId: args.orgId,
        userId: args.userId,
        kind: "model_variation" as const,
        provider: model.provider,
        modelKey: model.id,
        modelLabel: model.label,
        status,
        modelId: args.modelId,
        error,
      });

    const apiKey = providerKey(model.provider);
    if (!apiKey) {
      await logUsage("failed", missingKeyMessage(model.provider));
      return;
    }

    const refs = args.referenceImageUrls.filter(Boolean);
    const base = (args.prompt ?? "").trim();
    const prompt =
      "Photorealistic full-body fashion photograph of the exact same person " +
      "shown in the reference images — identical face, hair, skin tone and " +
      "body proportions. " +
      (base ? `${base}. ` : "") +
      `${randomModelScene()} Keep their identity and likeness perfectly ` +
      "consistent. " +
      referenceGuidance(model);

    try {
      const { storageId } = await generateAndStore(ctx, model, apiKey, {
        prompt,
        referenceImageUrls: refs,
      });
      await ctx.runMutation(internal.models.appendImage, {
        id: args.modelId,
        image: { storageId, source: "generated" },
      });
      await logUsage("succeeded");
    } catch (e) {
      await logUsage("failed", e instanceof Error ? e.message : String(e));
    }
  },
});
