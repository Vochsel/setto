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
   * Send `duration` as a JSON number instead of a string. A few endpoints
   * (e.g. Grok Imagine) type it as an integer; most fal i2v models want a
   * string enum ("5"/"10"). Ignored when `durationSuffix` is set.
   */
  durationAsNumber?: boolean;
  /**
   * Frame-based models (e.g. LTXV) take num_frames + frame_rate instead of a
   * duration. Set these and we derive num_frames = round(duration × fps).
   */
  framesParam?: string;
  frameRateParam?: string;
  fps?: number;
  falDefaultParams?: Record<string, unknown>;

  // ── Audio ────────────────────────────────────────────────────────────────
  /**
   * This model exposes a toggle to generate a synchronized audio track
   * (dialogue / ambience / SFX). We send `audioParam` and, when audio is on,
   * bill at `audioPricePerSecond`. Veo 3 is the canonical example.
   */
  supportsAudio?: boolean;
  /** The fal param that toggles audio, e.g. "generate_audio". */
  audioParam?: string;
  /** USD per second when audio is on (Veo 3 roughly doubles vs. audio off). */
  audioPricePerSecond?: number;
  /**
   * Audio is native and always present (no toggle) — e.g. Grok Imagine bakes
   * synchronized audio into every clip. `pricePerSecond` already includes it;
   * the UI shows an "audio" badge rather than a switch.
   */
  audioAlwaysOn?: boolean;
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
    id: "xai/grok-imagine-video/v1.5/image-to-video",
    provider: "fal",
    label: "Grok Imagine 1.5 — audio",
    description:
      "xAI Grok Imagine — lively, expressive motion with synchronized native audio (dialogue, ambience, SFX) baked into every clip.",
    falEndpoint: "xai/grok-imagine-video/v1.5/image-to-video",
    falImageParam: "image_url",
    pricePerSecond: 0.07, // 720p, audio included
    durations: [6],
    defaultDuration: 6,
    durationParam: "duration",
    durationAsNumber: true, // Grok types duration as an integer
    falDefaultParams: { resolution: "720p" },
    audioAlwaysOn: true,
  },
  {
    id: "fal-ai/veo3/image-to-video",
    provider: "fal",
    label: "Veo 3 — audio optional",
    description:
      "Google Veo 3 at full quality with an optional native audio track (dialogue, ambience, SFX). Top-tier realism; premium price, higher with audio.",
    falEndpoint: "fal-ai/veo3/image-to-video",
    falImageParam: "image_url",
    pricePerSecond: 0.2, // 720p, audio off
    durations: [4, 6, 8],
    defaultDuration: 8,
    durationParam: "duration",
    durationSuffix: "s", // "4s" | "6s" | "8s"
    supportsAudio: true,
    audioParam: "generate_audio",
    audioPricePerSecond: 0.4, // 720p, audio on
  },
  {
    id: "fal-ai/bytedance/seedance/v1/pro/image-to-video",
    provider: "fal",
    label: "Seedance 1.0 Pro",
    description:
      "ByteDance Seedance 1.0 Pro — crisp, cinematic 1080p motion with strong subject stability and prompt adherence.",
    falEndpoint: "fal-ai/bytedance/seedance/v1/pro/image-to-video",
    falImageParam: "image_url",
    pricePerSecond: 0.15, // ~$0.74 / 5s at 1080p
    durations: [5, 10],
    defaultDuration: 5,
    durationParam: "duration", // "5" | "10"
    falDefaultParams: { resolution: "1080p" },
  },
  {
    id: "fal-ai/wan-25-preview/image-to-video",
    provider: "fal",
    label: "Wan 2.5",
    description:
      "Alibaba Wan 2.5 — high visual quality and diverse, natural motion at a low price. Great value at 720p.",
    falEndpoint: "fal-ai/wan-25-preview/image-to-video",
    falImageParam: "image_url",
    pricePerSecond: 0.1, // 720p ($0.05/s 480p, $0.15/s 1080p)
    durations: [5, 10],
    defaultDuration: 5,
    durationParam: "duration", // "5" | "10"
    falDefaultParams: { resolution: "720p" },
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

/**
 * Estimated USD cost for a video of `seconds` from this model (0 if unknown).
 * When `withAudio` is set and the model has a paid audio toggle, bills at the
 * higher audio rate; native-audio models already price audio into
 * `pricePerSecond`, so they're unaffected.
 */
export function estimateVideoCost(
  modelKey: string,
  seconds: number,
  withAudio = false,
): number {
  const m = getVideoModel(modelKey);
  if (!m) return 0;
  const perSecond =
    withAudio && m.supportsAudio && m.audioPricePerSecond != null
      ? m.audioPricePerSecond
      : m.pricePerSecond;
  return perSecond * seconds;
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
  args: {
    prompt: string;
    imageUrl: string;
    duration: number;
    seed?: number;
    /** Toggle audio on `supportsAudio` models (ignored otherwise). */
    generateAudio?: boolean;
  },
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
    // Most fal i2v models take duration as a string enum ("5"/"10"), sometimes
    // with a unit suffix ("5s"); a few (Grok) type it as an integer.
    input[model.durationParam] =
      model.durationAsNumber && !model.durationSuffix
        ? args.duration
        : `${args.duration}${model.durationSuffix ?? ""}`;
  }
  // Audio toggle (only for models that expose one). Native-audio models leave
  // this unset — audio is always on and already priced in.
  if (model.supportsAudio && model.audioParam) {
    input[model.audioParam] = !!args.generateAudio;
  }
  return input;
}
