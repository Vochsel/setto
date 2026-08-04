/**
 * Turning "this product, on this person, in this place" into the two things a
 * provider actually takes: a prompt and a list of reference image URLs.
 *
 * Quick capture and the flow runner both need exactly this, and they must not
 * drift — an image generated from a flow should be indistinguishable from the
 * same combination captured by hand. Pure functions over already-resolved
 * context (see `generations:quickContext`), so callers in either Convex runtime
 * can use them, and so a "brief" can be produced without generating anything.
 */
import { buildPrompt } from "./prompt";
import { referenceGuidance, type ImageModel } from "./imageModels";

/** Already-resolved entity context — the shape `generations:quickContext` returns. */
export interface ShotContext {
  model: {
    name: string;
    promptDescriptor?: string;
    attributes?: Record<string, unknown> | null;
    imageUrls: string[];
  } | null;
  outfit: {
    name: string;
    promptDescriptor?: string;
    imageUrls: string[];
  } | null;
  variation: {
    id: string;
    name: string;
    promptDescriptor?: string;
    imageUrls: string[];
  } | null;
  location: {
    name?: string;
    address?: string;
    promptDescriptor?: string;
    streetViewUrls?: string[];
    imageUrls?: string[];
  } | null;
}

export interface ShotDirection {
  posePrompt?: string;
  clothingPrompt?: string;
  extraPrompt?: string;
}

/**
 * The person references are neutral studio model sheets — without this the
 * model tends to dress the subject in the sheet's grey T-shirt and copy its
 * T-pose, which is the opposite of a product shot.
 */
const IDENTITY_NOTE =
  " The person reference is a neutral studio model sheet — use it only for the " +
  "subject's facial identity and body proportions; do not copy its plain " +
  "clothing, T-pose, panel layout, or background.";

/** Deterministic rotation, so a batch varies its location grounding by index. */
function rotate<T>(items: T[], by: number): T[] {
  if (items.length < 2) return items;
  const n = ((by % items.length) + items.length) % items.length;
  return [...items.slice(n), ...items.slice(0, n)];
}

export interface ShotBrief {
  prompt: string;
  negativePrompt?: string;
  referenceImageUrls: string[];
}

/**
 * Build the prompt + references for one image.
 *
 * `index` varies the location grounding across a batch of otherwise identical
 * requests (image 2 of 4 leads with a different frame), which is what stops a
 * count of 4 returning the same composition four times.
 */
export function buildShotBrief(args: {
  context: ShotContext;
  model: ImageModel;
  direction?: ShotDirection;
  index?: number;
  scheduledAt?: number | null;
  timezone?: string | null;
}): ShotBrief {
  const { context: c, model, direction } = args;

  const assembled = buildPrompt({
    shot: {
      posePrompt: direction?.posePrompt,
      clothingPrompt: direction?.clothingPrompt,
      extraPrompt: direction?.extraPrompt,
      cameraFraming: null,
    },
    model: c.model,
    outfit: c.outfit,
    variation: c.variation,
    location: c.location,
    style: null,
    camera: null,
    lighting: null,
    scheduledAt: args.scheduledAt ?? null,
    timezone: args.timezone ?? null,
  });

  // A variation's own photos beat the product's generic ones — that's the whole
  // point of picking a colourway.
  const productImgs =
    (c.variation?.imageUrls?.length ? c.variation.imageUrls : c.outfit?.imageUrls) ??
    [];
  const modelImgs = c.model?.imageUrls ?? [];
  const locationImgs = rotate(
    [...(c.location?.streetViewUrls ?? []), ...(c.location?.imageUrls ?? [])],
    args.index ?? 0,
  );

  const referenceImageUrls = Array.from(
    new Set([
      ...productImgs.slice(0, 2),
      ...locationImgs.slice(0, 1),
      ...modelImgs.slice(0, 2),
      ...locationImgs.slice(1, 3),
    ]),
  );

  const prompt = referenceImageUrls.length
    ? `${assembled.prompt}\n\n${referenceGuidance(model)}${modelImgs.length ? IDENTITY_NOTE : ""}`
    : assembled.prompt;

  return {
    prompt,
    negativePrompt: assembled.negativePrompt,
    referenceImageUrls,
  };
}
