/**
 * Registry of fal image-to-video models. Mirrors `imageModels.ts`: the `id` is
 * stored on each video (modelKey) and shown in the picker; the worker dispatches
 * on `falEndpoint`. All current i2v models are fal-only and take a single source
 * image (`image_url`) plus a prompt, and return `{ video: { url } }`.
 *
 * Pricing is per second of output (the prevailing fal i2v billing model), so the
 * audited cost is `pricePerSecond × durationSeconds`. Values are estimates at the
 * model's default resolution and should be re-checked against fal docs over time.
 */

export interface VideoModel {
  id: string;
  provider: "fal";
  label: string;
  description: string;
  falEndpoint: string;
  /** Source-image field name on the fal endpoint (always a single image for i2v). */
  falImageParam: "image_url";
  /** Estimated USD per second of generated video, at the default resolution. */
  pricePerSecond: number;
  /** Selectable durations (seconds). First-class so the UI can offer a picker. */
  durations: number[];
  defaultDuration: number;
  /**
   * The fal param that carries duration. Omit for fixed-length models (e.g.
   * Veo 3) — we then never send a duration and just price the fixed length.
   */
  durationParam?: string;
  /** Suffix some models want on the duration value, e.g. Luma wants "5s". */
  durationSuffix?: string;
  /**
   * Frame-based models (e.g. LTXV) take num_frames + frame_rate instead of a
   * duration. Set these and we derive num_frames = round(duration × fps).
   */
  framesParam?: string;
  frameRateParam?: string;
  fps?: number;
  falDefaultParams?: Record<string, unknown>;
}

export const VIDEO_MODELS: VideoModel[] = [
  {
    id: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video",
    provider: "fal",
    label: "Kling 2.5 Turbo Pro",
    description:
      "Kling's flagship turbo model — fluid, coherent motion and strong prompt adherence. Great default for animating a shot.",
    falEndpoint: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video",
    falImageParam: "image_url",
    pricePerSecond: 0.07, // $0.35 / 5s, then $0.07/s
    durations: [5, 10],
    defaultDuration: 5,
    durationParam: "duration",
  },
  {
    id: "fal-ai/ltxv-13b-098-distilled/image-to-video",
    provider: "fal",
    label: "LTXV 13B (Distilled)",
    description:
      "The cheapest, fastest option — distilled LTX-Video. Best for quick, low-cost drafts at 480p.",
    falEndpoint: "fal-ai/ltxv-13b-098-distilled/image-to-video",
    falImageParam: "image_url",
    pricePerSecond: 0.02,
    durations: [5, 8],
    defaultDuration: 5,
    // Frame-based: num_frames = round(seconds × 24fps), at 480p to stay cheap.
    framesParam: "num_frames",
    frameRateParam: "frame_rate",
    fps: 24,
    falDefaultParams: { resolution: "480p" },
  },
  {
    id: "fal-ai/pixverse/v4.5/image-to-video",
    provider: "fal",
    label: "PixVerse v4.5",
    description:
      "Cheap and lively motion at 540p. A great budget pick with more polish than the distilled models.",
    falEndpoint: "fal-ai/pixverse/v4.5/image-to-video",
    falImageParam: "image_url",
    pricePerSecond: 0.03, // 540p: $0.15 / 5s (8s renders cost ~2×)
    durations: [5, 8],
    defaultDuration: 5,
    durationParam: "duration", // "5" | "8"
    falDefaultParams: { resolution: "540p" },
  },
  {
    id: "fal-ai/minimax/hailuo-02/standard/image-to-video",
    provider: "fal",
    label: "MiniMax Hailuo 02 — Standard",
    description:
      "Affordable 768p i2v with natural movement. The budget-friendly pick for quick animations.",
    falEndpoint: "fal-ai/minimax/hailuo-02/standard/image-to-video",
    falImageParam: "image_url",
    pricePerSecond: 0.045,
    durations: [6, 10],
    defaultDuration: 6,
    durationParam: "duration",
    falDefaultParams: { prompt_optimizer: true },
  },
  {
    id: "fal-ai/luma-dream-machine/ray-2/image-to-video",
    provider: "fal",
    label: "Luma Ray 2",
    description:
      "Cinematic, smooth camera moves and realistic physics. Best for filmic, dreamy motion.",
    falEndpoint: "fal-ai/luma-dream-machine/ray-2/image-to-video",
    falImageParam: "image_url",
    pricePerSecond: 0.1, // $0.50 / 5s at 540p
    durations: [5, 9],
    defaultDuration: 5,
    durationParam: "duration",
    durationSuffix: "s", // Luma expects "5s" / "9s"
  },
  {
    id: "fal-ai/veo3/fast/image-to-video",
    provider: "fal",
    label: "Veo 3 Fast",
    description:
      "Google Veo 3 (fast) — top-tier realism and detail. Fixed ~8s clips, no audio.",
    falEndpoint: "fal-ai/veo3/fast/image-to-video",
    falImageParam: "image_url",
    pricePerSecond: 0.1, // without audio
    durations: [8],
    defaultDuration: 8,
    // No durationParam — Veo 3 produces a fixed-length clip.
  },
];

export const DEFAULT_VIDEO_MODEL_ID =
  "fal-ai/kling-video/v2.5-turbo/pro/image-to-video";

export function getVideoModel(id: string): VideoModel | undefined {
  return VIDEO_MODELS.find((m) => m.id === id);
}

/** Estimated USD cost for a video of `seconds` from this model (0 if unknown). */
export function estimateVideoCost(modelKey: string, seconds: number): number {
  const m = getVideoModel(modelKey);
  if (!m) return 0;
  return m.pricePerSecond * seconds;
}

/** Compact per-second price, e.g. "$0.07/s". Reuses imageModels' formatPrice. */
export function formatPricePerSecond(usd: number | undefined): string {
  if (usd == null) return "—";
  const s = usd.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return `$${s}/s`;
}

/** Build the request body a fal i2v endpoint expects. */
export function buildFalVideoInput(
  model: VideoModel,
  args: { prompt: string; imageUrl: string; duration: number; seed?: number },
): Record<string, unknown> {
  const input: Record<string, unknown> = {
    prompt: args.prompt,
    ...(model.falDefaultParams ?? {}),
  };
  input[model.falImageParam] = args.imageUrl;
  if (typeof args.seed === "number") input.seed = args.seed;
  if (model.framesParam) {
    // Frame-based models: derive frame count from the requested seconds.
    const fps = model.fps ?? 24;
    input[model.framesParam] = Math.round(args.duration * fps);
    if (model.frameRateParam) input[model.frameRateParam] = fps;
  } else if (model.durationParam) {
    // fal i2v models take duration as a string, sometimes with a unit suffix.
    input[model.durationParam] = `${args.duration}${model.durationSuffix ?? ""}`;
  }
  return input;
}
