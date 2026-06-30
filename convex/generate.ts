"use node";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { fal } from "@fal-ai/client";
import { buildPrompt, buildCreativePrompt, BASE_VARIATION_ID } from "./lib/prompt";
import {
  getImageModel,
  buildFalInput,
  referenceGuidance,
  DEFAULT_MODEL_ID,
  DEFAULT_VARIATION_MODEL_ID,
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

/**
 * Map an app aspect ratio ("w:h") to the nearest gpt-image-1 size. OpenAI only
 * offers square / portrait / landscape, so every portrait ratio maps to the
 * portrait canvas and every landscape ratio to the landscape one. Returns
 * undefined for an unknown/unset ratio (keep the model default).
 */
function openaiSizeForAspect(aspectRatio?: string): string | undefined {
  if (!aspectRatio) return undefined;
  const [w, h] = aspectRatio.split(":").map(Number);
  if (!w || !h) return undefined;
  if (w === h) return "1024x1024";
  return w > h ? "1536x1024" : "1024x1536";
}

/** OpenAI gpt-image-1. Uses /edits when references are supplied, else /generations. Returns base64 PNG. */
async function callOpenAI(
  model: ImageModel,
  apiKey: string,
  args: { prompt: string; referenceImageUrls: string[]; aspectRatio?: string },
): Promise<{ b64: string; mime: string }> {
  const size =
    openaiSizeForAspect(args.aspectRatio) ?? model.openaiSize ?? "1024x1536";
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
  args: { prompt: string; referenceImageUrls: string[]; aspectRatio?: string },
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
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      // Pin the output shape when requested (e.g. the fixed-size model sheet).
      ...(args.aspectRatio
        ? { generationConfig: { imageConfig: { aspectRatio: args.aspectRatio } } }
        : {}),
    }),
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
  args: { prompt: string; referenceImageUrls: string[]; aspectRatio?: string },
): Promise<{ storageId: Id<"_storage">; url: string }> {
  if (model.provider === "fal") {
    fal.config({ credentials: apiKey });
    const input = buildFalInput(model, {
      prompt: args.prompt,
      referenceImageUrls: args.referenceImageUrls,
      aspectRatio: args.aspectRatio,
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

/**
 * The standardized model reference. A single neutral "model sheet" — a clear
 * face close-up, a few head angles, and a full-body T-pose (front + side) on a
 * seamless studio backdrop in plain neutral clothing. Neutral clothing is
 * deliberate: the sheet teaches identity + proportions, not wardrobe, so a
 * shot's real outfit dominates instead of the reference's clothing bleeding in.
 */
/** Fixed output shape for every model image (headshot + sheet), so the library
 * stays uniform. 4:5 portrait matches the model library tile aspect. */
const MODEL_IMAGE_ASPECT = "4:5";

/** A clean, neutral studio headshot — the model's primary face reference and
 * card thumbnail. Neutral grey clothing keeps wardrobe out of the reference.
 * `refMode` controls how the reference images (if any) are used:
 *  - "none": no references — render purely from the text description.
 *  - "identity": reproduce the exact same person shown (re-rendering a headshot).
 *  - "resemblance": invent a brand-new person who merely *resembles* the
 *    reference — same overall look, but a distinct individual (the "from a
 *    reference image" creation mode). */
function modelHeadshotPrompt(
  descriptor: string,
  refMode: "none" | "identity" | "resemblance",
): string {
  return (
    "Photorealistic studio headshot portrait — head and shoulders, centred, " +
    "facing the camera with a clear, unobstructed face and a relaxed neutral " +
    "expression. " +
    (refMode === "identity"
      ? "The exact same person shown in the reference images — identical face, " +
        "hair and skin tone. "
      : refMode === "resemblance"
        ? "A brand-new, fictional person who closely resembles the look of the " +
          "reference image — the same approximate age, build, hair colour and " +
          "style, skin tone and overall facial character — but a distinct " +
          "individual, NOT an exact copy or recognisable likeness of the person " +
          "shown. "
        : "") +
    (descriptor ? `${descriptor}. ` : "") +
    "Plain heather-grey crew-neck T-shirt, seamless light-grey background, soft " +
    "even lighting, natural skin texture, sharp focus, no text or watermark."
  );
}

function modelSheetPrompt(descriptor?: string): string {
  const base = (descriptor ?? "").trim();
  return (
    "Create a professional character reference sheet of the exact same person " +
    "shown in the reference images — identical face, hair, skin tone and body " +
    "proportions. " +
    (base ? `${base}. ` : "") +
    "Compose it as a compact 4:5 portrait sheet that COMPLETELY FILLS the frame " +
    "with no empty bands, blank margins or gaps between panels, on a seamless " +
    "light-grey studio backdrop with soft, even, neutral lighting. Upper third: " +
    "a single row of three equally-sized head-and-shoulders views at the same " +
    "scale — a front-facing face close-up, an angled three-quarter view, and a " +
    "side profile. Lower two-thirds: two equally-sized full-body T-poses at the " +
    "same scale, side by side — one from the front and one from the side — arms " +
    "held out horizontally in a neutral, straight stance, head near the top of " +
    "that band and feet at the bottom edge. Scale the rows so they touch and the " +
    "entire frame is used. Dress them in plain, form-fitting NEUTRAL clothing — a " +
    "plain heather-grey crew-neck T-shirt and plain mid-grey shorts, barefoot — " +
    "no logos, patterns, jewellery or accessories. Keep the person's identity " +
    "perfectly consistent across every view. Photorealistic, natural skin " +
    "texture, sharp focus, no text, labels, captions or watermark."
  );
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
    // The base-outfit sentinel maps to a null target (no variation) so its
    // generation is recorded as base (variationId undefined), same as an
    // unselected shot. Real variation ids pass through unchanged.
    const targets: (string | null)[] = variationIds.length
      ? variationIds.map((id) => (id === BASE_VARIATION_ID ? null : id))
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
        shot: {
          name: c.shot.name,
          posePrompt: c.shot.posePrompt,
          clothingPrompt: c.shot.clothingPrompt,
          extraPrompt: c.shot.extraPrompt,
          cameraFraming: c.shot.cameraFraming,
        },
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
      // Nudge multi-image models to actually use the references (provider-aware),
      // and — when the subject reference is included — tell the model to read it
      // for identity only, never for clothing (the model reference is a neutral
      // studio sheet, so its plain clothing must not bleed into the wardrobe).
      const identityNote = modelImgs.length
        ? " The person reference is a neutral studio model sheet — use it only " +
          "for the subject's facial identity and body proportions; do not copy " +
          "its plain clothing, T-pose, panel layout, or background."
        : "";
      const promptText = references.length
        ? `${assembled.prompt}\n\n${referenceGuidance(model)}${identityNote}`
        : assembled.prompt;

      const genId = await ctx.runMutation(internal.generations.create, {
        orgId,
        createdBy: userId,
        shotId: args.shotId,
        shootId: c.shootId,
        variationId: variationId ?? undefined,
        // Freeze the shot's current recipe onto the generation so galleries
        // attribute this image correctly even if the shot is re-cast later.
        modelId: c.modelId ?? undefined,
        outfitId: c.outfitId ?? undefined,
        locationId: c.locationId ?? undefined,
        styleId: c.styleId ?? undefined,
        cameraId: c.cameraId ?? undefined,
        lightingId: c.lightingId ?? undefined,
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
        aspectRatio: c.shot.aspectRatio ?? undefined,
      });
    }
    return { generationIds };
  },
});

/**
 * Generate from a camera capture. The captured / uploaded photo is the real
 * location/scene — it is NOT stored as a photo of its own; it's only fed to the
 * chosen image model (Nano Banana 2 / GPT Image 2 / Nano Banana Pro) as the
 * scene reference, alongside the model + product, exactly like a website shot
 * generation. Produces one generation under the location's shot (created if
 * needed) and runs in the background via `runOne`.
 */
export const generateFromCapture = action({
  args: {
    storageId: v.id("_storage"),
    modelKey: v.string(),
    shotId: v.optional(v.id("shots")),
    shootLocationId: v.optional(v.id("shootLocations")),
    modelId: v.optional(v.id("models")),
    outfitId: v.optional(v.id("outfits")),
  },
  // Explicit return type breaks the circular `internal`-API inference (this
  // action references the same `internal` namespace it lives in).
  handler: async (
    ctx,
    args,
  ): Promise<{ generationId: Id<"generations"> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const userId = identity.subject;
    const orgId = (identity.org_id as string | undefined) ?? `user:${userId}`;

    const model = getImageModel(args.modelKey);
    if (!model) throw new Error(`Unknown model: ${args.modelKey}`);

    const sceneUrl = await ctx.storage.getUrl(args.storageId);
    if (!sceneUrl) throw new Error("Captured image not found");

    const shotId: Id<"shots"> = await ctx.runMutation(
      internal.generations.ensureCaptureShot,
      {
        orgId,
        shotId: args.shotId,
        shootLocationId: args.shootLocationId,
        modelId: args.modelId,
        outfitId: args.outfitId,
      },
    );

    const c = await ctx.runQuery(internal.generations.context, { shotId });
    if (c.orgId !== orgId) throw new Error("Not found");

    const assembled = buildPrompt({
      shot: {
        name: c.shot.name,
        posePrompt: c.shot.posePrompt,
        clothingPrompt: c.shot.clothingPrompt,
        extraPrompt: c.shot.extraPrompt,
        cameraFraming: c.shot.cameraFraming,
      },
      model: c.model,
      outfit: c.outfit,
      variation: null,
      location: c.location,
      style: c.style,
      camera: c.camera,
      lighting: c.lighting,
      scheduledAt: c.scheduledAt,
      timezone: c.timezone,
    });

    // The captured photo is the REAL scene — send it first and steer the model
    // to place the subject into it.
    const outfitImgs = c.outfit?.imageUrls ?? [];
    const modelImgs = c.model?.imageUrls ?? [];
    const locationShots = [
      ...(c.location?.streetViewUrls ?? []),
      ...(c.location?.imageUrls ?? []),
    ];
    const references = Array.from(
      new Set([
        sceneUrl,
        ...outfitImgs.slice(0, 2),
        ...modelImgs.slice(0, 2),
        ...locationShots.slice(0, 1),
      ]),
    );
    const sceneNote =
      " The FIRST reference image is a real photo of the exact location/scene the " +
      "shot was taken in — place the subject naturally into that setting, matching " +
      "its perspective, lighting, framing and background.";
    const identityNote = modelImgs.length
      ? " The person reference is a neutral studio model sheet — use it only for the " +
        "subject's facial identity and proportions; do not copy its plain clothing, " +
        "pose, panel layout, or background."
      : "";
    const promptText = `${assembled.prompt}\n\n${referenceGuidance(model)}${sceneNote}${identityNote}`;

    const genId: Id<"generations"> = await ctx.runMutation(
      internal.generations.create,
      {
        orgId,
        createdBy: userId,
        shotId,
        shootId: c.shootId,
        modelId: c.modelId ?? undefined,
        outfitId: c.outfitId ?? undefined,
        locationId: c.locationId ?? undefined,
        styleId: c.styleId ?? undefined,
        cameraId: c.cameraId ?? undefined,
        lightingId: c.lightingId ?? undefined,
        provider: model.provider,
        modelKey: args.modelKey,
        modelLabel: model.label,
        prompt: promptText,
        negativePrompt: assembled.negativePrompt,
      },
    );

    await ctx.scheduler.runAfter(0, internal.generate.runOne, {
      genId,
      modelKey: args.modelKey,
      prompt: promptText,
      referenceImageUrls: references,
      aspectRatio: c.shot.aspectRatio ?? undefined,
    });
    return { generationId: genId };
  },
});

/**
 * The instruction that turns a finished frame into fresh, realistic variations
 * of itself (image-to-image). It deliberately keeps the subject, wardrobe and
 * setting while varying pose / expression / framing / light, so the result
 * reads as another frame from the same shoot rather than an unrelated image.
 */
function buildVariationPrompt(userPrompt?: string): string {
  const base =
    "Create a new, realistic variation of the attached photograph. Keep the " +
    "same person and their likeness, the same wardrobe, the same location and " +
    "the same overall photographic style, but naturally vary the pose, " +
    "expression, camera framing and lighting so it reads as a different frame " +
    "from the same photoshoot. Photorealistic, natural skin texture, sharp " +
    "focus, no text, watermark or added graphics.";
  const extra = (userPrompt ?? "").trim();
  return extra ? `${base}\n\nAdditional direction: ${extra}` : base;
}

/**
 * Generate one or more realistic variations of an existing finished image
 * (image-to-image), conditioned on that image as the reference. Defaults to a
 * cheap editor model and an optional extra prompt. New rows attach to the same
 * shot (with the source's frozen recipe snapshot) so they appear alongside the
 * original and attribute correctly in galleries. Returns immediately; each
 * variation is produced by the shared `runOne` worker.
 */
export const generateVariations = action({
  args: {
    generationId: v.id("generations"),
    prompt: v.optional(v.string()),
    modelKey: v.optional(v.string()),
    count: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const userId = identity.subject;
    const orgId = (identity.org_id as string | undefined) ?? `user:${userId}`;

    const src = await ctx.runQuery(internal.generations.variationSource, {
      generationId: args.generationId,
    });
    if (src.orgId !== orgId) throw new Error("Not found");
    if (!src.imageUrl) throw new Error("Source image is not available yet");

    const modelKey = args.modelKey ?? DEFAULT_VARIATION_MODEL_ID;
    const model = getImageModel(modelKey);
    if (!model) throw new Error(`Unknown model: ${modelKey}`);

    const count = Math.min(Math.max(args.count ?? 1, 1), 4);
    const promptText = buildVariationPrompt(args.prompt);

    const generationIds: string[] = [];
    for (let i = 0; i < count; i++) {
      const genId = await ctx.runMutation(internal.generations.create, {
        orgId,
        createdBy: userId,
        shotId: src.shotId,
        shootId: src.shootId,
        // Carry the source frame's frozen recipe so per-model / per-location
        // galleries attribute the variation exactly like the original.
        modelId: src.modelId ?? undefined,
        outfitId: src.outfitId ?? undefined,
        locationId: src.locationId ?? undefined,
        styleId: src.styleId ?? undefined,
        cameraId: src.cameraId ?? undefined,
        lightingId: src.lightingId ?? undefined,
        provider: model.provider,
        modelKey,
        modelLabel: model.label,
        prompt: promptText,
      });
      generationIds.push(genId);
      await ctx.scheduler.runAfter(0, internal.generate.runOne, {
        genId,
        modelKey,
        prompt: promptText,
        // The source image IS the reference (image-to-image / edit).
        referenceImageUrls: [src.imageUrl],
        aspectRatio: src.aspectRatio ?? undefined,
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
    aspectRatio: v.optional(v.string()),
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
          aspectRatio: args.aspectRatio,
        });
        // Stream coarse progress to the row as the fal queue advances (sync
        // callback, so fire-and-forget the patch, only on status transitions).
        let last = "";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = await fal.subscribe(model.falEndpoint!, {
          input,
          onQueueUpdate: (update) => {
            if (update.status === last) return;
            last = update.status;
            if (update.status === "IN_QUEUE") {
              const pos =
                "queue_position" in update ? update.queue_position : undefined;
              void ctx.runMutation(internal.generations.setProgress, {
                id: args.genId,
                progress: 0.1,
                progressLabel: pos != null ? `In queue (${pos})` : "In queue…",
              });
            } else if (update.status === "IN_PROGRESS") {
              void ctx.runMutation(internal.generations.setProgress, {
                id: args.genId,
                progress: 0.5,
                progressLabel: "Generating…",
              });
            }
          },
        });
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
                aspectRatio: args.aspectRatio,
              })
            : await callGoogle(model, apiKey, {
                prompt: args.prompt,
                referenceImageUrls: args.referenceImageUrls,
                aspectRatio: args.aspectRatio,
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
      bakeCopy: c.bakeCopyIntoImage,
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
 * Generate a single model reference image and store it (NOT attached to any
 * model — the caller curates it in the editor). `kind` selects the prompt:
 *  - "headshot": a clean neutral studio headshot — the card thumbnail. Rendered
 *    from the text description, or conditioned on a reference image. When a
 *    reference is supplied, `resemblance` chooses how it's used: false (default)
 *    reproduces the exact same person (re-rendering an existing headshot); true
 *    invents a brand-new person who merely *resembles* the reference (the
 *    "upload a reference image" creation mode).
 *  - "sheet": the standardized neutral model reference sheet (face + head
 *    angles + T-pose front/side) seeded from the headshot for identity.
 * Both are produced at the fixed model-image aspect so the library is uniform.
 *
 * References may be passed as ready URLs (`referenceImageUrls`) and/or as
 * Convex storage ids (`referenceStorageIds`) — the latter are resolved to URLs
 * here, so a just-uploaded image (which has no signed URL client-side yet) can
 * still seed the generation.
 */
export const generateModelImage = action({
  args: {
    kind: v.optional(v.union(v.literal("headshot"), v.literal("sheet"))),
    prompt: v.optional(v.string()),
    referenceImageUrls: v.optional(v.array(v.string())),
    // Accept storage ids as plain strings (not v.id) so a stale / cross-
    // deployment id doesn't fail argument validation before the handler runs —
    // we resolve them leniently below and just skip any that don't belong here.
    referenceStorageIds: v.optional(v.array(v.string())),
    resemblance: v.optional(v.boolean()),
    modelKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const userId = identity.subject;
    const orgId = (identity.org_id as string | undefined) ?? `user:${userId}`;

    const kind = args.kind ?? "headshot";
    const model =
      getImageModel(args.modelKey ?? DEFAULT_MODEL_ID) ??
      getImageModel(DEFAULT_MODEL_ID)!;
    const logUsage = (status: "succeeded" | "failed", error?: string) =>
      ctx.runMutation(internal.usage.record, {
        orgId,
        userId,
        kind:
          kind === "sheet"
            ? ("model_sheet" as const)
            : ("model_portrait" as const),
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

    // Resolve any storage ids to signed URLs and merge with ready URLs, so a
    // freshly-uploaded reference (storageId only) still conditions the result.
    const resolvedFromStorage: string[] = [];
    for (const sid of args.referenceStorageIds ?? []) {
      try {
        const url = await ctx.storage.getUrl(sid as Id<"_storage">);
        if (url) resolvedFromStorage.push(url);
      } catch {
        // Skip ids that aren't valid storage ids for this deployment (e.g. a
        // stale dev id used against prod) rather than crashing the request.
      }
    }
    const refs = [
      ...(args.referenceImageUrls ?? []),
      ...resolvedFromStorage,
    ].filter(Boolean);
    const base = (args.prompt ?? "").trim();

    let prompt: string;
    if (kind === "sheet") {
      prompt = `${modelSheetPrompt(base)} ${referenceGuidance(model)}`;
    } else {
      const refMode =
        refs.length === 0
          ? "none"
          : args.resemblance
            ? "resemblance"
            : "identity";
      prompt = modelHeadshotPrompt(base, refMode);
      if (refs.length) prompt += ` ${referenceGuidance(model)}`;
    }

    try {
      const out = await generateAndStore(ctx, model, apiKey, {
        prompt,
        referenceImageUrls: refs,
        aspectRatio: MODEL_IMAGE_ASPECT,
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
 * Back-migrate models to the standardized neutral reference sheet. For each
 * target model with at least one reference image, schedule a background job
 * that regenerates a single neutral sheet (seeded from its current images for
 * identity) and REPLACES the model's images with it. `modelIds` omitted => all
 * non-archived models in the workspace.
 */
export const migrateModelsToSheets = action({
  args: {
    modelIds: v.optional(v.array(v.id("models"))),
    modelKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const userId = identity.subject;
    const orgId = (identity.org_id as string | undefined) ?? `user:${userId}`;

    const all = await ctx.runQuery(api.models.list, {});
    const wanted = args.modelIds
      ? new Set(args.modelIds as string[])
      : null;
    const modelKey = args.modelKey ?? DEFAULT_MODEL_ID;

    let scheduled = 0;
    for (const m of all) {
      if (wanted && !wanted.has(m._id)) continue;
      // Seed identity from the headshot (fall back to the first image); never
      // from the old sheet, so the new sheet isn't a copy of the previous one.
      const seed = m.headshotUrl ?? m.imageUrls?.[0]?.url;
      if (!seed) continue; // need at least one image to seed identity
      await ctx.scheduler.runAfter(0, internal.generate.runModelSheet, {
        orgId,
        userId,
        modelId: m._id,
        modelKey,
        prompt: m.promptDescriptor ?? m.name,
        referenceImageUrls: [seed],
      });
      scheduled++;
    }
    return { scheduled };
  },
});

/** Background worker: generate one neutral model sheet and REPLACE the model's
 * images with it (the standardized single reference). */
export const runModelSheet = internalAction({
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
        kind: "model_sheet" as const,
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
    const prompt = `${modelSheetPrompt((args.prompt ?? "").trim())} ${referenceGuidance(model)}`;

    try {
      const { storageId } = await generateAndStore(ctx, model, apiKey, {
        prompt,
        referenceImageUrls: refs,
        aspectRatio: MODEL_IMAGE_ASPECT,
      });
      await ctx.runMutation(internal.models.setSheet, {
        id: args.modelId,
        image: { storageId, source: "sheet" },
      });
      await logUsage("succeeded");
    } catch (e) {
      await logUsage("failed", e instanceof Error ? e.message : String(e));
    }
  },
});
