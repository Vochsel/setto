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
   * Aspect ratios this fal endpoint actually accepts. When set, a requested
   * ratio outside the list is snapped to the closest supported one (so e.g. a
   * 4:5 request doesn't error on FLUX/Imagen). Omit when the endpoint accepts
   * any ratio (e.g. Gemini) or ignores aspect_ratio.
   */
  falAspectRatios?: string[];

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
  {
    id: "fal-ai/nano-banana/edit",
    provider: "fal",
    label: "Nano Banana — via fal",
    description: "Gemini Flash Image through fal.",
    supportsImagePrompt: true,
    pricePerImage: 0.039,
    falEndpoint: "fal-ai/nano-banana/edit",
    falImageParam: "image_urls",
    falDefaultParams: { num_images: 1 },
  },
  {
    id: "fal-ai/flux-pro/v1.1-ultra",
    provider: "fal",
    label: "FLUX1.1 [pro] ultra — via fal",
    description: "Top-tier FLUX photorealism (text-to-image).",
    supportsImagePrompt: false,
    pricePerImage: 0.06,
    falEndpoint: "fal-ai/flux-pro/v1.1-ultra",
    falDefaultParams: { aspect_ratio: "3:4", num_images: 1, safety_tolerance: "5" },
    falAspectRatios: ["21:9", "16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16", "9:21"],
  },
  {
    id: "fal-ai/flux/dev/image-to-image",
    provider: "fal",
    label: "FLUX [dev] image-to-image — via fal",
    description: "FLUX dev conditioned on a reference image.",
    supportsImagePrompt: true,
    pricePerImage: 0.025,
    falEndpoint: "fal-ai/flux/dev/image-to-image",
    falImageParam: "image_url",
    falDefaultParams: { strength: 0.85, num_images: 1 },
  },
  {
    id: "fal-ai/imagen4/preview",
    provider: "fal",
    label: "Imagen 4 — via fal",
    description: "Google Imagen 4 (text-to-image).",
    supportsImagePrompt: false,
    pricePerImage: 0.04,
    falEndpoint: "fal-ai/imagen4/preview",
    falDefaultParams: { aspect_ratio: "3:4", num_images: 1 },
    falAspectRatios: ["1:1", "16:9", "9:16", "3:4", "4:3"],
  },
  {
    id: "fal-ai/ideogram/v3",
    provider: "fal",
    label: "Ideogram v3 — via fal",
    description: "Great composition and typography.",
    supportsImagePrompt: false,
    pricePerImage: 0.08,
    falEndpoint: "fal-ai/ideogram/v3",
    falDefaultParams: { rendering_speed: "BALANCED", num_images: 1 },
  },
  {
    id: "fal-ai/recraft-v3",
    provider: "fal",
    label: "Recraft v3 — via fal",
    description: "Versatile photo and design styles.",
    supportsImagePrompt: false,
    pricePerImage: 0.04,
    falEndpoint: "fal-ai/recraft-v3",
    falDefaultParams: { image_size: "portrait_4_3" },
  },
];

export const PROVIDER_LABEL: Record<ImageProvider, string> = {
  google: "Google",
  openai: "OpenAI",
  fal: "fal",
};

export const DEFAULT_MODEL_ID = "google/gemini-2.5-flash-image";

export function getImageModel(id: string): ImageModel | undefined {
  return IMAGE_MODELS.find((m) => m.id === id);
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
  if (model.provider === "google") {
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
  // Pin the output shape when requested (e.g. the fixed-size model sheet).
  // Snap to a ratio the endpoint accepts so e.g. 4:5 doesn't error on FLUX.
  if (args.aspectRatio && !("image_size" in input)) {
    input.aspect_ratio = model.falAspectRatios
      ? snapAspect(args.aspectRatio, model.falAspectRatios)
      : args.aspectRatio;
  }
  const refs = args.referenceImageUrls?.filter(Boolean) ?? [];
  if (model.supportsImagePrompt && refs.length && model.falImageParam) {
    if (model.falImageParam === "image_urls") input.image_urls = refs;
    else input.image_url = refs[0];
  }
  return input;
}
