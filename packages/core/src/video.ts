/**
 * Shared, pure model for the video/clips feature — the platform-agnostic
 * "spec" that describes a composition (ordered clips, effects, transitions,
 * audio, resolution, fps), the template registry, and the math used to turn a
 * spec into a timeline.
 *
 * This module is imported by THREE consumers and therefore must stay pure
 * (no React, no Convex, no Node APIs):
 *   - Convex functions  (build/validate specs, snapshot for renders)
 *   - the web editor     (live preview + timeline UI)
 *   - the Remotion package (the actual <Timeline> composition + Lambda render)
 *
 * The Convex schema (`convex/schema.ts`) declares matching `v.object`
 * validators by hand — keep the two in sync. iOS mirrors these as Codable
 * structs.
 */

// ── Core spec types ───────────────────────────────────────────────────────

export type VideoSourceType = "image" | "video";

/**
 * A Ken Burns (pan/zoom) move applied to an image clip. Scales are multipliers
 * (1 = fit); x/y are normalized focal offsets in [-1, 1] (0 = centered). The
 * clip animates linearly from the `from*` state to the `to*` state over its
 * duration. Ignored for video clips.
 */
export interface VideoEffect {
  type: "none" | "kenburns";
  fromScale?: number;
  toScale?: number;
  fromX?: number;
  fromY?: number;
  toX?: number;
  toY?: number;
}

export type TransitionType = "none" | "fade" | "dissolve" | "slide" | "wipe";

/** How a clip enters from the previous one (sequence templates only). */
export interface VideoTransition {
  type: TransitionType;
  durationMs: number;
}

/**
 * A single clip on the timeline. `url` is a fully-resolved, playable media URL
 * (image or mp4). Provenance ids let us trace a clip back to its source shot /
 * generation / i2v video for re-generation and "convert to images".
 */
export interface VideoClip {
  id: string;
  sourceType: VideoSourceType;
  url: string;
  posterUrl?: string;
  /** How long this clip occupies the timeline, in milliseconds. */
  durationMs: number;
  /** For video clips: offset into the source where playback starts. */
  trimStartMs?: number;
  effect?: VideoEffect;
  /** Transition INTO this clip from the previous one. */
  transition?: VideoTransition;
  /** Stack templates: 0-based layer index (higher = on top). */
  layer?: number;
  caption?: string;
  // Provenance (optional).
  generationId?: string;
  videoId?: string;
  shotId?: string;
}

/** Background audio bed for the whole composition. */
export interface VideoAudio {
  url: string;
  name?: string;
  /** Built-in track id, if chosen from the library (vs. an upload). */
  trackId?: string;
  /** Offset into the audio track where playback starts, in ms. */
  startMs?: number;
  /** 0..1 linear gain. */
  volume?: number;
}

/**
 * The full, self-contained composition the renderer consumes.
 *
 * Declared as a `type` (not an `interface`) on purpose: Remotion's
 * `<Composition>` constrains its props to `Record<string, unknown>`, and only
 * type-aliased object types satisfy that index signature.
 */
export type VideoSpec = {
  templateId: string;
  width: number;
  height: number;
  fps: number;
  background?: string;
  clips: VideoClip[];
  audio?: VideoAudio;
};

// ── Templates ─────────────────────────────────────────────────────────────

export type TemplateKind = "sequence" | "stack";

/**
 * A starting point for a composition. Templates seed sensible defaults (clip
 * length, effect, transition, resolution) and pick a render mode:
 *   - "sequence" plays clips one after another (slideshow / Ken Burns / reels)
 *   - "stack" layers clips on top of each other, revealing them over time
 */
export interface VideoTemplate {
  id: string;
  name: string;
  description: string;
  kind: TemplateKind;
  /** Default time each clip occupies, in ms. */
  defaultClipMs: number;
  defaultEffect: VideoEffect["type"];
  defaultTransition: VideoTransition;
  /** Resolution preset key (see RESOLUTIONS). */
  defaultResolution: string;
  defaultFps: number;
  background: string;
  /** Stack templates: delay between successive layer reveals, in ms. */
  stackStaggerMs?: number;
  /** Whether new clips should default to image stills or generated video. */
  prefersVideoClips?: boolean;
  /** A light emoji used in the picker before we have real thumbnails. */
  emoji?: string;
}

export const TEMPLATES: VideoTemplate[] = [
  {
    id: "slideshow",
    name: "Slideshow",
    description:
      "Clean cuts between stills with a soft crossfade. The simplest way to turn a set of shots into a video.",
    kind: "sequence",
    defaultClipMs: 2500,
    defaultEffect: "none",
    defaultTransition: { type: "fade", durationMs: 350 },
    defaultResolution: "1080x1920",
    defaultFps: 30,
    background: "#000000",
    emoji: "🖼️",
  },
  {
    id: "kenburns",
    name: "Ken Burns",
    description:
      "Slow cinematic pan & zoom on each still (done on the image, no video generation) with dissolves between them.",
    kind: "sequence",
    defaultClipMs: 3500,
    defaultEffect: "kenburns",
    defaultTransition: { type: "dissolve", durationMs: 600 },
    defaultResolution: "1080x1920",
    defaultFps: 30,
    background: "#000000",
    emoji: "🎞️",
  },
  {
    id: "reel",
    name: "Video Reel",
    description:
      "Generated motion clips played back to back with hard cuts. Animates each shot, then strings them together.",
    kind: "sequence",
    defaultClipMs: 5000,
    defaultEffect: "none",
    defaultTransition: { type: "none", durationMs: 0 },
    defaultResolution: "1080x1920",
    defaultFps: 30,
    background: "#000000",
    prefersVideoClips: true,
    emoji: "🎬",
  },
  {
    id: "fastcuts",
    name: "Fast Cuts",
    description:
      "Punchy quick cuts with a subtle zoom — great for an energetic, beat-driven edit.",
    kind: "sequence",
    defaultClipMs: 900,
    defaultEffect: "kenburns",
    defaultTransition: { type: "none", durationMs: 0 },
    defaultResolution: "1080x1920",
    defaultFps: 30,
    background: "#000000",
    emoji: "⚡",
  },
  {
    id: "cinematic",
    name: "Cinematic",
    description:
      "Letterboxed, slow Ken Burns with long dissolves for a moody, filmic feel.",
    kind: "sequence",
    defaultClipMs: 4500,
    defaultEffect: "kenburns",
    defaultTransition: { type: "dissolve", durationMs: 900 },
    defaultResolution: "1920x1080",
    defaultFps: 24,
    background: "#000000",
    emoji: "🎥",
  },
  {
    id: "stack",
    name: "Photo Stack",
    description:
      "Lays images on top of each other, dropping a new one in over time — like a pile of polaroids building up.",
    kind: "stack",
    defaultClipMs: 1200,
    defaultEffect: "none",
    defaultTransition: { type: "fade", durationMs: 300 },
    defaultResolution: "1080x1920",
    defaultFps: 30,
    background: "#111111",
    stackStaggerMs: 700,
    emoji: "🗂️",
  },
];

export const DEFAULT_TEMPLATE_ID = "slideshow";

export function getTemplate(id: string | undefined): VideoTemplate {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

// ── Resolution & fps presets ──────────────────────────────────────────────

export interface ResolutionPreset {
  key: string;
  label: string;
  width: number;
  height: number;
  aspect: string;
}

export const RESOLUTIONS: ResolutionPreset[] = [
  { key: "1080x1920", label: "1080×1920 · 9:16 vertical", width: 1080, height: 1920, aspect: "9:16" },
  { key: "720x1280", label: "720×1280 · 9:16 (lighter)", width: 720, height: 1280, aspect: "9:16" },
  { key: "1080x1350", label: "1080×1350 · 4:5 portrait", width: 1080, height: 1350, aspect: "4:5" },
  { key: "1080x1080", label: "1080×1080 · 1:1 square", width: 1080, height: 1080, aspect: "1:1" },
  { key: "1920x1080", label: "1920×1080 · 16:9 landscape", width: 1920, height: 1080, aspect: "16:9" },
  { key: "1280x720", label: "1280×720 · 16:9 (lighter)", width: 1280, height: 720, aspect: "16:9" },
  { key: "2160x3840", label: "2160×3840 · 4K vertical", width: 2160, height: 3840, aspect: "9:16" },
];

export function getResolution(key: string | undefined): ResolutionPreset {
  return RESOLUTIONS.find((r) => r.key === key) ?? RESOLUTIONS[0];
}

export const FPS_OPTIONS = [24, 30, 60] as const;

// ── Built-in audio library ────────────────────────────────────────────────

export interface AudioTrack {
  id: string;
  name: string;
  url: string;
  durationMs?: number;
  mood?: string;
}

/**
 * Built-in background tracks. Seeded empty by default; populate with your own
 * royalty-free/licensed URLs (or drop files in and serve them). The editor also
 * supports uploading a track per-project, which does not require this registry.
 */
export const AUDIO_TRACKS: AudioTrack[] = [];

export function getAudioTrack(id: string | undefined): AudioTrack | undefined {
  if (!id) return undefined;
  return AUDIO_TRACKS.find((t) => t.id === id);
}

// ── Timeline math ─────────────────────────────────────────────────────────

export function msToFrames(ms: number, fps: number): number {
  return Math.max(1, Math.round((ms / 1000) * fps));
}

export function framesToMs(frames: number, fps: number): number {
  return (frames / fps) * 1000;
}

/**
 * Total wall-clock duration of a spec, in ms.
 *
 * For "sequence" templates, consecutive clips overlap by their incoming
 * transition duration, so the timeline is shorter than the naive sum. For
 * "stack" templates every clip starts at a staggered offset and they all run
 * until the end, so the duration is the max end across layers.
 */
export function specDurationMs(spec: VideoSpec): number {
  const template = getTemplate(spec.templateId);
  if (!spec.clips.length) return 0;

  if (template.kind === "stack") {
    const stagger = template.stackStaggerMs ?? 600;
    let maxEnd = 0;
    spec.clips.forEach((clip, i) => {
      const start = i * stagger;
      maxEnd = Math.max(maxEnd, start + clip.durationMs);
    });
    return maxEnd;
  }

  // Sequence: sum durations, then subtract each clip's incoming overlap.
  let total = 0;
  spec.clips.forEach((clip, i) => {
    total += clip.durationMs;
    if (i > 0) {
      const overlap = Math.min(
        clip.transition?.durationMs ?? 0,
        clip.durationMs,
        spec.clips[i - 1].durationMs,
      );
      total -= overlap;
    }
  });
  return Math.max(0, total);
}

export function specDurationFrames(spec: VideoSpec): number {
  return Math.max(1, msToFrames(specDurationMs(spec), spec.fps));
}

/** A reasonable default Ken Burns move, alternated by index so it varies. */
export function defaultKenBurns(index: number): VideoEffect {
  // Alternate zoom-in/zoom-out and pan direction for visual variety.
  const zoomIn = index % 2 === 0;
  const dir = index % 4;
  const panX = dir === 1 ? 0.18 : dir === 3 ? -0.18 : 0;
  const panY = dir === 0 ? -0.12 : dir === 2 ? 0.12 : 0;
  return {
    type: "kenburns",
    fromScale: zoomIn ? 1.0 : 1.18,
    toScale: zoomIn ? 1.18 : 1.0,
    fromX: zoomIn ? 0 : panX,
    fromY: zoomIn ? 0 : panY,
    toX: zoomIn ? panX : 0,
    toY: zoomIn ? panY : 0,
  };
}

/** Stable-ish clip id generator (pure; not crypto-grade). */
export function makeClipId(): string {
  const rnd = Math.random().toString(36).slice(2, 9);
  return `clip_${rnd}`;
}

export interface MediaInput {
  sourceType: VideoSourceType;
  url: string;
  posterUrl?: string;
  durationMs?: number;
  generationId?: string;
  videoId?: string;
  shotId?: string;
}

/**
 * Build an ordered clip list from a set of source media using a template's
 * defaults. The renderer/editor can then tweak per-clip timing and effects.
 */
export function buildClips(media: MediaInput[], template: VideoTemplate): VideoClip[] {
  return media.map((m, i) => {
    const isImage = m.sourceType === "image";
    const effect: VideoEffect | undefined =
      isImage && template.defaultEffect === "kenburns"
        ? defaultKenBurns(i)
        : isImage
          ? { type: "none" }
          : undefined; // video clips never get Ken Burns
    return {
      id: makeClipId(),
      sourceType: m.sourceType,
      url: m.url,
      posterUrl: m.posterUrl,
      // Video clips keep their own length when known; stills use the template's.
      durationMs: m.durationMs ?? template.defaultClipMs,
      effect,
      transition:
        i === 0
          ? { type: "none", durationMs: 0 }
          : { ...template.defaultTransition },
      layer: template.kind === "stack" ? i : undefined,
      generationId: m.generationId,
      videoId: m.videoId,
      shotId: m.shotId,
    };
  });
}

/**
 * Assemble a fresh spec from media + a template, applying the template's
 * resolution/fps defaults.
 */
export function buildSpec(media: MediaInput[], templateId: string): VideoSpec {
  const template = getTemplate(templateId);
  const res = getResolution(template.defaultResolution);
  return {
    templateId: template.id,
    width: res.width,
    height: res.height,
    fps: template.defaultFps,
    background: template.background,
    clips: buildClips(media, template),
  };
}

/** Estimated Remotion Lambda cost (very rough) for a render, in USD. */
export function estimateRenderCost(spec: VideoSpec): number {
  // Lambda render cost scales with output frames × resolution. This is a coarse
  // heuristic for display/audit only — actual cost comes back from Lambda.
  const frames = specDurationFrames(spec);
  const megapixels = (spec.width * spec.height) / 1_000_000;
  // ~$0.0000004 per frame-megapixel is a conservative ballpark.
  return frames * megapixels * 0.0000004;
}
