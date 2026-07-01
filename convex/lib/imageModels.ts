/**
 * Registry of image-generation models across providers. The `id` is stored on
 * each generation (modelKey) and shown in the switcher. The generate action
 * dispatches on `provider`.
 */

export type ImageProvider = "fal" | "openai" | "google";

export interface ImageModel {
  id: string;
  provider: ImageProvider;
  label: string;
  description: string;
  /** Whether reference images (model identity / Street View) can condition it. */
  supportsImagePrompt: boolean;
  /**
   * Approximate provider cost per generated image, in USD. Used for team usage
   * tracking and shown in the picker. Estimates at the configured size/quality.
   */
  pricePerImage: number;

  // fal
  falEndpoint?: string;
  falImageParam?: "image_urls" | "image_url";
  falDefaultParams?: Record<string, unknown>;
  /**
   * How this fal endpoint controls output shape:
   *  - "aspect_ratio"     → an `aspect_ratio` string (FLUX classic, Gemini)
   *  - "image_size_enum"  → fal's named `image_size` enum (FLUX.2, Qwen)
   *  - "image_size_dims"  → an explicit `{width,height}` (Seedream — its enum
   *                          portrait sizes fall below its min-area limit)
   * Defaults to "aspect_ratio".
   */
  falSize?: "aspect_ratio" | "image_size_enum" | "image_size_dims";
  /**
   * Aspect ratios this fal endpoint accepts (only for `falSize:"aspect_ratio"`).
   * A request outside the list is snapped to the closest supported one so e.g.
   * 4:5 doesn't error on FLUX. Omit when any ratio is accepted (e.g. Gemini).
   */
  falAspectRatios?: string[];
  /** Cap on how many reference images to send (some editors take only a few). */
  falMaxImages?: number;

  // openai
  openaiModel?: string;
  openaiSize?: string;
  openaiQuality?: "low" | "medium" | "high" | "auto";

  // google (Gemini / "nano banana")
  googleModel?: string;
}

export const IMAGE_MODELS: ImageModel[] = [
  // ── Google (direct) ──────────────────────────────────────────────
  {
    id: "google/gemini-3-pro-image-preview",
    provider: "google",
    label: "Nano Banana Pro — Gemini 3 Pro Image",
    description:
      "Google's top image model. Best reasoning, composition and reference fidelity — uses real locations as inspiration without copying them.",
    supportsImagePrompt: true,
    pricePerImage: 0.134,
    googleModel: "gemini-3-pro-image-preview",
  },
  {
    id: "google/gemini-2.5-flash-image",
    provider: "google",
    label: "Nano Banana — Gemini 2.5 Flash Image",
    description:
      "Google direct. Fast and great at honoring reference photos — ideal for grounding a shot in real location imagery.",
    supportsImagePrompt: true,
    pricePerImage: 0.039,
    googleModel: "gemini-2.5-flash-image",
  },
  {
    id: "google/gemini-3.1-flash-lite-image",
    provider: "google",
    label: "Nano Banana 2 Lite — Gemini Flash Lite Image",
    description:
      "Google's fastest, most efficient image model. Lowest cost and lightning-fast — great for high-volume generation while keeping character consistency.",
    supportsImagePrompt: true,
    pricePerImage: 0.034,
    googleModel: "gemini-3.1-flash-lite-image",
  },
  // ── OpenAI (direct) ──────────────────────────────────────────────
  {
    id: "openai/gpt-image-2",
    provider: "openai",
    label: "GPT Image 2",
    description:
      "OpenAI's newest — highest fidelity, excellent prompt adherence and reference-image support.",
    supportsImagePrompt: true,
    pricePerImage: 0.25,
    openaiModel: "gpt-image-2",
    openaiSize: "1024x1536",
    openaiQuality: "high",
  },
  {
    id: "openai/gpt-image-1.5",
    provider: "openai",
    label: "GPT Image 1.5",
    description: "Strong quality with reference-image support.",
    supportsImagePrompt: true,
    pricePerImage: 0.25,
    openaiModel: "gpt-image-1.5",
    openaiSize: "1024x1536",
    openaiQuality: "high",
  },
  {
    id: "openai/gpt-image-1",
    provider: "openai",
    label: "GPT Image 1",
    description:
      "Strong prompt adherence and text; uses reference images via the edits endpoint.",
    supportsImagePrompt: true,
    pricePerImage: 0.19,
    openaiModel: "gpt-image-1",
    openaiSize: "1024x1536",
    openaiQuality: "high",
  },
  {
    id: "openai/gpt-image-1-mini",
    provider: "openai",
    label: "GPT Image 1 mini",
    description: "Faster and cheaper; good for quick iterations.",
    supportsImagePrompt: true,
    pricePerImage: 0.04,
    openaiModel: "gpt-image-1-mini",
    openaiSize: "1024x1536",
    openaiQuality: "medium",
  },
  // ── fal ──────────────────────────────────────────────────────────
  // Only multi-image *editors* live here: our pipeline conditions on several
  // reference photos (outfit + location + model), so text-to-image or
  // single-image endpoints (old FLUX ultra / Imagen / Ideogram / Recraft /
  // FLUX dev) ignored our references and produced poor results. These four
  // follow an instruction prompt across many references like Nano Banana does.
  {
    id: "fal-ai/nano-banana-2/edit",
    provider: "fal",
    label: "Nano Banana 2 — via fal",
    description:
      "Gemini 3.1 Flash Image through fal. Excellent multi-reference editing and prompt coherence — the fal route to Nano Banana.",
    supportsImagePrompt: true,
    pricePerImage: 0.08,
    falEndpoint: "fal-ai/nano-banana-2/edit",
    falImageParam: "image_urls",
    falDefaultParams: { num_images: 1 },
    falSize: "aspect_ratio", // accepts the full ratio set, no snapping needed
  },
  {
    id: "fal-ai/bytedance/seedream/v4/edit",
    provider: "fal",
    label: "Seedream 4 — via fal",
    description:
      "ByteDance Seedream 4. Top-tier multi-reference editing (up to 10 images) with strong instruction following — a great non-Gemini alternative.",
    supportsImagePrompt: true,
    pricePerImage: 0.04,
    falEndpoint: "fal-ai/bytedance/seedream/v4/edit",
    falImageParam: "image_urls",
    falDefaultParams: { num_images: 1, max_images: 1 },
    falSize: "image_size_dims", // enum portrait sizes fall below its min area
  },
  {
    id: "fal-ai/flux-2-pro/edit",
    provider: "fal",
    label: "FLUX.2 [pro] edit — via fal",
    description:
      "Black Forest Labs FLUX.2 [pro]. Multi-reference editing (up to 9 images) with sharp photorealism and strong prompt adherence.",
    supportsImagePrompt: true,
    pricePerImage: 0.045,
    falEndpoint: "fal-ai/flux-2-pro/edit",
    falImageParam: "image_urls",
    falDefaultParams: {},
    falSize: "image_size_enum",
  },
  {
    id: "fal-ai/qwen-image-edit-plus",
    provider: "fal",
    label: "Qwen Image Edit Plus — via fal",
    description:
      "Alibaba Qwen-Image-Edit. Multi-image editing with excellent prompt and text fidelity; cheapest of the editors.",
    supportsImagePrompt: true,
    pricePerImage: 0.04,
    falEndpoint: "fal-ai/qwen-image-edit-plus",
    falImageParam: "image_urls",
    falDefaultParams: { num_images: 1 },
    falSize: "image_size_enum",
    falMaxImages: 3,
  },
];

export const PROVIDER_LABEL: Record<ImageProvider, string> = {
  google: "Google",
  openai: "OpenAI",
  fal: "fal",
};

export const DEFAULT_MODEL_ID = "google/gemini-2.5-flash-image";

/**
 * Default model for "generate variations" off an existing photo — a cheap,
 * realistic image-to-image editor. Nano Banana honours the source frame well
 * while still producing a fresh take, at ~$0.04 an image.
 */
export const DEFAULT_VARIATION_MODEL_ID = "google/gemini-2.5-flash-image";

export function getImageModel(id: string): ImageModel | undefined {
  return IMAGE_MODELS.find((m) => m.id === id);
}

/**
 * The image models offered for variations: every image-to-image / edit-capable
 * model in the registry. Variations run off an existing image, so any model
 * that can be conditioned on a reference photo (`supportsImagePrompt`) can
 * produce them. Ordered cheapest-first so the most economical option leads,
 * with the default variation model pinned to the front.
 */
export function variationModels(): ImageModel[] {
  return IMAGE_MODELS.filter((m) => m.supportsImagePrompt).sort((a, b) => {
    if (a.id === DEFAULT_VARIATION_MODEL_ID) return -1;
    if (b.id === DEFAULT_VARIATION_MODEL_ID) return 1;
    return a.pricePerImage - b.pricePerImage;
  });
}

/** Estimated USD cost for one image from this model (0 if unknown). */
export function estimateCost(modelKey: string): number {
  return getImageModel(modelKey)?.pricePerImage ?? 0;
}

/** Compact per-image price, e.g. "$0.039" or "$0.25". */
export function formatPrice(usd: number | undefined): string {
  if (usd == null) return "—";
  const s = usd.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return `$${s}`;
}

/**
 * How the model should treat the reference images. Gemini ("nano banana")
 * tends to literally edit/return the photo you give it, so we steer it to use
 * the location only as inspiration and compose a fresh image; other providers
 * get a stricter "reproduce" instruction.
 */
export function referenceGuidance(model: ImageModel): string {
  // Multi-image editors (Gemini + the fal editors) tend to literally
  // edit/return an input photo, so steer them to compose fresh and treat the
  // location as inspiration. OpenAI is more controllable, so it gets the
  // stricter "reproduce" instruction.
  if (model.provider === "google" || model.provider === "fal") {
    return (
      "Use the reference images as guidance only: match the subject's likeness " +
      "and reproduce the outfit, and treat the location photo purely as " +
      "inspiration for the setting and architecture. Do NOT copy, crop, paste, " +
      "or directly edit any reference image — compose a brand-new photograph."
    );
  }
  return (
    "Reference images: reproduce the outfit shown, place the subject in the " +
    "real location shown, and keep the subject's likeness consistent."
  );
}

/** Numeric value of an "w:h" ratio, or NaN if unparseable. */
function aspectValue(ratio: string): number {
  const [w, h] = ratio.split(":").map(Number);
  return w && h ? w / h : NaN;
}

/**
 * Snap a requested aspect ratio to the closest one in `supported` (by numeric
 * ratio). Returns the request unchanged when it's already supported or can't be
 * parsed. Keeps a model from erroring on a ratio it doesn't offer.
 */
export function snapAspect(requested: string, supported: string[]): string {
  if (supported.includes(requested)) return requested;
  const target = aspectValue(requested);
  if (Number.isNaN(target)) return requested;
  let best = requested;
  let bestDelta = Infinity;
  for (const s of supported) {
    const delta = Math.abs(aspectValue(s) - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = s;
    }
  }
  return best;
}

/** fal's named image_size enum, keyed by numeric ratio (w/h) for snapping. */
const FAL_IMAGE_SIZE_ENUM: Record<string, number> = {
  square_hd: 1,
  portrait_4_3: 3 / 4,
  portrait_16_9: 9 / 16,
  landscape_4_3: 4 / 3,
  landscape_16_9: 16 / 9,
};

/** Map an "w:h" ratio to the nearest fal `image_size` enum value. */
function aspectToImageSizeEnum(ratio: string): string {
  const v = aspectValue(ratio);
  if (Number.isNaN(v)) return "square_hd";
  let best = "square_hd";
  let bestDelta = Infinity;
  for (const [name, rv] of Object.entries(FAL_IMAGE_SIZE_ENUM)) {
    const delta = Math.abs(rv - v);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = name;
    }
  }
  return best;
}

/**
 * Explicit {width,height} for an "w:h" ratio, longer side `long`, rounded to a
 * multiple of 16. Used for endpoints (Seedream) whose enum portrait sizes fall
 * below their minimum area.
 */
function aspectToDims(
  ratio: string,
  long = 2048,
): { width: number; height: number } {
  const v = aspectValue(ratio);
  if (Number.isNaN(v) || v === 1) return { width: long, height: long };
  const r16 = (n: number) => Math.max(512, Math.round(n / 16) * 16);
  return v > 1
    ? { width: long, height: r16(long / v) }
    : { width: r16(long * v), height: long };
}

/** The output-shape param(s) for a fal model given a requested aspect ratio. */
function falSizeInput(
  model: ImageModel,
  aspectRatio: string,
): Record<string, unknown> {
  switch (model.falSize) {
    case "image_size_enum":
      return { image_size: aspectToImageSizeEnum(aspectRatio) };
    case "image_size_dims":
      return { image_size: aspectToDims(aspectRatio) };
    case "aspect_ratio":
    default:
      return {
        aspect_ratio: model.falAspectRatios
          ? snapAspect(aspectRatio, model.falAspectRatios)
          : aspectRatio,
      };
  }
}

/** Build the request body a fal endpoint expects. */
export function buildFalInput(
  model: ImageModel,
  args: {
    prompt: string;
    referenceImageUrls?: string[];
    seed?: number;
    aspectRatio?: string;
  },
): Record<string, unknown> {
  const input: Record<string, unknown> = {
    prompt: args.prompt,
    ...(model.falDefaultParams ?? {}),
  };
  if (typeof args.seed === "number") input.seed = args.seed;
  // Pin the output shape when requested, unless a default already sets it.
  if (args.aspectRatio && !("image_size" in input) && !("aspect_ratio" in input)) {
    Object.assign(input, falSizeInput(model, args.aspectRatio));
  }
  let refs = args.referenceImageUrls?.filter(Boolean) ?? [];
  if (model.falMaxImages) refs = refs.slice(0, model.falMaxImages);
  if (model.supportsImagePrompt && refs.length && model.falImageParam) {
    if (model.falImageParam === "image_urls") input.image_urls = refs;
    else input.image_url = refs[0];
  }
  return input;
}
