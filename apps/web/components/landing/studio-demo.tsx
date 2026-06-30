"use client";

/**
 * Landing-page Studio demo — a self-contained, clickable miniature of the real
 * shoot editor. Pick a location → model → outfit → variations, choose a model
 * and aspect ratio, hit Generate, and watch curated sample renders fan out
 * (one image per selected variation, exactly like the product). Each result can
 * be animated into a short video.
 *
 * No backend, no auth, no API keys: everything is driven by `lib/demo-data` and
 * static assets under `public/demo/`, with a simulated generation timeline so
 * the page feels alive. Missing assets degrade to labelled gradient tiles, so
 * the demo is never broken even before `scripts/gen-demo-assets.mjs` has run.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapPin,
  Sparkles,
  Loader2,
  Film,
  Play,
  Layers,
  Check,
  Eye,
  X,
  RotateCcw,
  ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEMO_LOCATIONS,
  DEMO_MODELS,
  DEMO_OUTFITS,
  DEMO_IMAGE_MODELS,
  DEMO_VIDEO_MODELS,
  DEMO_ASPECT_RATIOS,
  formatUsd,
  type DemoVariation,
} from "@/lib/demo-data";

type Phase = "idle" | "running" | "done";
type VideoPhase = "idle" | "running" | "done";

// Aspect-ratio → tailwind utility for the result tiles. Falls back to 3:4.
const ASPECT_CLASS: Record<string, string> = {
  "3:4": "aspect-[3/4]",
  "4:5": "aspect-[4/5]",
  "1:1": "aspect-square",
  "9:16": "aspect-[9/16]",
  "16:9": "aspect-[16/9]",
};

export function StudioDemo() {
  const [locationId, setLocationId] = useState(DEMO_LOCATIONS[0].id);
  const [modelId, setModelId] = useState(DEMO_MODELS[0].id);
  const [outfitId, setOutfitId] = useState(DEMO_OUTFITS[0].id);
  const [imageModelId, setImageModelId] = useState(DEMO_IMAGE_MODELS[0].id);
  const [videoModelId, setVideoModelId] = useState(DEMO_VIDEO_MODELS[0].id);
  const [aspect, setAspect] = useState("3:4");

  const location = DEMO_LOCATIONS.find((l) => l.id === locationId)!;
  const model = DEMO_MODELS.find((m) => m.id === modelId)!;
  const outfit = DEMO_OUTFITS.find((o) => o.id === outfitId)!;
  const imageModel = DEMO_IMAGE_MODELS.find((m) => m.id === imageModelId)!;

  // Variation multi-select. Defaults to the first look of the chosen outfit.
  const [selectedVarIds, setSelectedVarIds] = useState<string[]>([
    DEMO_OUTFITS[0].variations[0].id,
  ]);

  const [phase, setPhase] = useState<Phase>("idle");
  const [done, setDone] = useState<Set<string>>(new Set());
  const [videoPhase, setVideoPhase] = useState<Record<string, VideoPhase>>({});
  const [showPrompt, setShowPrompt] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  const selectedVars = useMemo(
    () => outfit.variations.filter((v) => selectedVarIds.includes(v.id)),
    [outfit, selectedVarIds],
  );
  const genCount = Math.max(selectedVars.length, 1);

  // Any change to the inputs invalidates the current render — drop back to idle
  // so "Generate" always reflects what's on screen. (Mirrors how the real card
  // re-prices the moment you touch a control.)
  const selectionKey = `${locationId}|${modelId}|${outfitId}|${aspect}|${imageModelId}|${[
    ...selectedVarIds,
  ]
    .sort()
    .join(",")}`;
  // Reset-on-change via the React "adjust state during render" pattern (no
  // effect): when the inputs change, drop back to idle so "Generate" always
  // reflects what's on screen.
  const [lastKey, setLastKey] = useState(selectionKey);
  if (selectionKey !== lastKey) {
    setLastKey(selectionKey);
    setPhase("idle");
    setDone(new Set());
    setVideoPhase({});
  }

  // Cancel any in-flight simulated generation when the selection changes (the
  // cleanup fires on key change and on unmount) so superseded timers can't
  // flip state back to a stale "done".
  useEffect(() => () => clearTimers(timers), [selectionKey]);

  function chooseOutfit(id: string) {
    const next = DEMO_OUTFITS.find((o) => o.id === id)!;
    setOutfitId(id);
    setSelectedVarIds([next.variations[0].id]);
  }

  function toggleVariation(id: string) {
    setSelectedVarIds((prev) =>
      prev.includes(id)
        ? prev.length > 1
          ? prev.filter((x) => x !== id)
          : prev // keep at least one selected
        : [...prev, id],
    );
  }

  function generate() {
    clearTimers(timers);
    setDone(new Set());
    setVideoPhase({});
    setPhase("running");
    const ids = selectedVars.map((v) => v.id);
    ids.forEach((id, i) => {
      const t = window.setTimeout(
        () => setDone((d) => new Set(d).add(id)),
        650 + i * 520,
      );
      timers.current.push(t);
    });
    const end = window.setTimeout(
      () => setPhase("done"),
      650 + (ids.length - 1) * 520 + 450,
    );
    timers.current.push(end);
  }

  function animate(v: DemoVariation) {
    setVideoPhase((p) => ({ ...p, [v.id]: "running" }));
    const t = window.setTimeout(
      () => setVideoPhase((p) => ({ ...p, [v.id]: "done" })),
      1900,
    );
    timers.current.push(t);
  }

  const promptText = buildDemoPrompt({
    model: model.promptDescriptor,
    location: `${location.name} — ${location.promptDescriptor}`,
    outfit: outfit.promptDescriptor,
    variation: selectedVars[0]?.promptDescriptor,
  });

  const lightboxVar = selectedVars.find((v) => v.id === lightbox) ?? null;

  return (
    <div className="ss03 overflow-hidden rounded-2xl border border-white/12 bg-[#0a0a0a] shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)] highlight-inset">
      {/* App-window chrome */}
      <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.03] px-4 py-3">
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
        </div>
        <div className="ml-1 flex min-w-0 items-center gap-2 text-[13px] text-white/55">
          <span className="hidden truncate sm:inline">setto.app / shoots /</span>
          <span className="truncate font-medium text-white/80">
            Autumn Campaign · Shot 01
          </span>
        </div>
        <span className="ml-auto hidden items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300/90 sm:inline-flex">
          <span className="size-1.5 rounded-full bg-emerald-400" /> Live preview
        </span>
      </div>

      {/* Body: controls rail + output canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr]">
        {/* ── Controls rail ─────────────────────────────────────── */}
        <div className="space-y-6 border-b border-white/10 p-5 lg:border-b-0 lg:border-r">
          {/* Location */}
          <Section icon={<MapPin className="size-3.5" />} label="Location">
            <div className="grid grid-cols-3 gap-2">
              {DEMO_LOCATIONS.map((l) => {
                const active = l.id === locationId;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setLocationId(l.id)}
                    className={cn(
                      "group relative overflow-hidden rounded-lg border text-left transition-all",
                      active
                        ? "border-white/70 ring-1 ring-white/40"
                        : "border-white/10 hover:border-white/30",
                    )}
                  >
                    <div className="aspect-[4/3] w-full">
                      <DemoImg
                        src={l.thumb}
                        alt={l.name}
                        label={l.name}
                        className="size-full object-cover"
                      />
                    </div>
                    {active && (
                      <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-white text-black">
                        <Check className="size-2.5" />
                      </span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/90 to-transparent px-1.5 pb-1 pt-3 text-[10px] font-medium text-white">
                      {l.name}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-white/40">
              {location.address} · grounded in real Street View
            </p>
          </Section>

          {/* Model */}
          <Section icon={<UsersIcon />} label="Model">
            <div className="flex gap-2">
              {DEMO_MODELS.map((m) => {
                const active = m.id === modelId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setModelId(m.id)}
                    className="flex flex-col items-center gap-1.5"
                    title={m.name}
                  >
                    <span
                      className={cn(
                        "block size-12 overflow-hidden rounded-full border-2 transition-all",
                        active
                          ? "border-white ring-2 ring-white/30"
                          : "border-white/15 opacity-70 hover:opacity-100",
                      )}
                    >
                      <DemoImg
                        src={m.avatar}
                        alt={m.name}
                        label={m.name[0]}
                        rounded
                        className="size-full object-cover"
                      />
                    </span>
                    <span
                      className={cn(
                        "text-[11px]",
                        active ? "text-white" : "text-white/45",
                      )}
                    >
                      {m.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Wardrobe */}
          <Section icon={<ShirtIcon />} label="Wardrobe">
            <div className="space-y-1.5">
              {DEMO_OUTFITS.map((o) => {
                const active = o.id === outfitId;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => chooseOutfit(o.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-[13px] transition-colors",
                      active
                        ? "border-white/60 bg-white/10 text-white"
                        : "border-white/10 text-white/60 hover:border-white/25 hover:text-white",
                    )}
                  >
                    <span className="flex -space-x-1">
                      {o.variations.map((v) => (
                        <span
                          key={v.id}
                          className="size-3 rounded-full border border-black/40"
                          style={{ background: v.swatch }}
                        />
                      ))}
                    </span>
                    <span className="truncate">{o.name}</span>
                    {active && <Check className="ml-auto size-3.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Variations */}
          <Section
            icon={<Layers className="size-3.5" />}
            label="Variations"
            hint="tap to include · one image each"
          >
            <div className="flex flex-wrap gap-1.5">
              {outfit.variations.map((v) => {
                const active = selectedVarIds.includes(v.id);
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => toggleVariation(v.id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                      active
                        ? "border-white/70 bg-white/10 text-white"
                        : "border-white/12 text-white/55 hover:border-white/30",
                    )}
                  >
                    <span
                      className="size-3 rounded-full"
                      style={{ background: v.swatch }}
                    />
                    {v.name}
                    {active && <Check className="size-3" />}
                  </button>
                );
              })}
            </div>
          </Section>
        </div>

        {/* ── Output canvas ─────────────────────────────────────── */}
        <div className="flex flex-col p-5">
          {/* Generate bar */}
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect
              value={imageModelId}
              onChange={setImageModelId}
              className="min-w-0 flex-1"
              aria-label="Image model"
            >
              {DEMO_IMAGE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · ~{formatUsd(m.price)}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              value={aspect}
              onChange={setAspect}
              className="w-20 shrink-0"
              aria-label="Aspect ratio"
            >
              {DEMO_ASPECT_RATIOS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </NativeSelect>
            <button
              type="button"
              onClick={() => setShowPrompt((s) => !s)}
              aria-label="Preview assembled prompt"
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors",
                showPrompt
                  ? "border-white/40 bg-white/10 text-white"
                  : "border-white/12 text-white/55 hover:border-white/30 hover:text-white",
              )}
            >
              <Eye className="size-4" />
            </button>
            <button
              type="button"
              onClick={generate}
              disabled={phase === "running"}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-white px-4 text-[13px] font-medium text-black transition-colors hover:bg-white/85 disabled:opacity-60"
            >
              {phase === "running" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Generate{genCount > 1 ? ` ×${genCount}` : ""}
            </button>
          </div>

          <div className="mt-1.5 flex items-center justify-between text-[11px] text-white/40">
            <span>
              {model.name} · {location.name} · {outfit.name}
            </span>
            <span className="tabular-nums">
              Est. ~{formatUsd(imageModel.price * genCount)} · {genCount} image
              {genCount > 1 ? "s" : ""}
            </span>
          </div>

          {showPrompt && (
            <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-white/55">
              {promptText}
            </pre>
          )}

          {/* Results */}
          <div className="mt-4 flex-1">
            {phase === "idle" ? (
              <EmptyState count={genCount} />
            ) : (
              <div
                className={cn(
                  "grid gap-3",
                  genCount === 1
                    ? "grid-cols-1 sm:max-w-[260px]"
                    : "grid-cols-2 sm:grid-cols-3",
                )}
              >
                {selectedVars.map((v) => (
                  <ResultTile
                    key={v.id}
                    variation={v}
                    aspectClass={ASPECT_CLASS[aspect] ?? ASPECT_CLASS["3:4"]}
                    ready={done.has(v.id)}
                    videoPhase={videoPhase[v.id] ?? "idle"}
                    modelName={model.name}
                    onAnimate={() => animate(v)}
                    onOpen={() => done.has(v.id) && setLightbox(v.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Video model + caption */}
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/10 pt-3 text-[11px] text-white/40">
            <span className="flex items-center gap-1.5">
              <Film className="size-3.5" /> Animate with
            </span>
            <NativeSelect
              value={videoModelId}
              onChange={setVideoModelId}
              className="h-7 py-0 text-[11px]"
              aria-label="Video model"
            >
              {DEMO_VIDEO_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · ~{formatUsd(m.pricePerSecond)}/s
                </option>
              ))}
            </NativeSelect>
            {phase === "done" && (
              <button
                type="button"
                onClick={generate}
                className="ml-auto flex items-center gap-1 text-white/45 transition-colors hover:text-white"
              >
                <RotateCcw className="size-3" /> Regenerate
              </button>
            )}
          </div>
        </div>
      </div>

      {lightboxVar && (
        <Lightbox
          variation={lightboxVar}
          videoReady={(videoPhase[lightboxVar.id] ?? "idle") === "done"}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

/* ───────────────────────────── Subcomponents ─────────────────────────── */

function Section({
  icon,
  label,
  hint,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.6px] text-white/40">
        {icon}
        {label}
        {hint && (
          <span className="ml-1 normal-case tracking-normal text-white/25">
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function ResultTile({
  variation,
  aspectClass,
  ready,
  videoPhase,
  modelName,
  onAnimate,
  onOpen,
}: {
  variation: DemoVariation;
  aspectClass: string;
  ready: boolean;
  videoPhase: VideoPhase;
  modelName: string;
  onAnimate: () => void;
  onOpen: () => void;
}) {
  const showVideo = videoPhase === "done";
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]",
        aspectClass,
      )}
    >
      {!ready ? (
        <GeneratingOverlay />
      ) : showVideo ? (
        variation.video ? (
          <video
            src={variation.video}
            poster={variation.image}
            autoPlay
            loop
            muted
            playsInline
            className="size-full object-cover"
          />
        ) : (
          // No pre-rendered clip — fall back to a live, looping camera push so
          // the "video" still moves.
          <DemoImg
            src={variation.image}
            alt={variation.name}
            label={variation.name}
            className="size-full origin-center animate-[demo-pan_6s_ease-in-out_infinite] object-cover"
          />
        )
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="block size-full cursor-zoom-in"
        >
          <DemoImg
            src={variation.image}
            alt={variation.name}
            label={variation.name}
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </button>
      )}

      {/* Variation label */}
      {ready && (
        <span className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
          <span
            className="size-2 rounded-full"
            style={{ background: variation.swatch }}
          />
          {variation.name}
        </span>
      )}

      {/* Animate / playing state */}
      {ready && videoPhase !== "done" && (
        <button
          type="button"
          onClick={onAnimate}
          disabled={videoPhase === "running"}
          className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[10px] font-medium text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 disabled:opacity-100"
        >
          {videoPhase === "running" ? (
            <>
              <Loader2 className="size-3 animate-spin" /> Animating…
            </>
          ) : (
            <>
              <Film className="size-3" /> Animate
            </>
          )}
        </button>
      )}
      {showVideo && (
        <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[10px] font-medium text-white backdrop-blur">
          <Play className="size-3 fill-current" /> Video · {modelName}
        </span>
      )}
    </div>
  );
}

function GeneratingOverlay() {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-2 bg-[linear-gradient(110deg,#0e0e10,#16161a,#0e0e10)] bg-[length:200%_100%] animate-[demo-shimmer_1.4s_linear_infinite] text-white/40">
      <Loader2 className="size-5 animate-spin" />
      <span className="text-[10px]">Rendering…</span>
    </div>
  );
}

function EmptyState({ count }: { count: number }) {
  return (
    <div className="flex h-full min-h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-white/12 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-white/5 text-white/45">
        <ImageIcon className="size-5" />
      </div>
      <p className="mt-3 text-[14px] font-medium text-white/80">
        Ready when you are
      </p>
      <p className="mt-1 max-w-xs text-[12px] text-white/40">
        Hit <span className="text-white/70">Generate</span> to fan out{" "}
        {count} on-location image{count > 1 ? "s" : ""} — one per variation —
        then animate any of them into video.
      </p>
    </div>
  );
}

function Lightbox({
  variation,
  videoReady,
  onClose,
}: {
  variation: DemoVariation;
  videoReady: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        type="button"
        className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        onClick={onClose}
        aria-label="Close"
      >
        <X className="size-4" />
      </button>
      <div
        className="max-h-[85vh] overflow-hidden rounded-xl border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {videoReady && variation.video ? (
          <video
            src={variation.video}
            poster={variation.image}
            autoPlay
            loop
            muted
            playsInline
            controls
            className="max-h-[85vh] w-auto"
          />
        ) : (
          <DemoImg
            src={variation.image}
            alt={variation.name}
            label={variation.name}
            className="max-h-[85vh] w-auto"
          />
        )}
      </div>
    </div>
  );
}

/** Native <select> styled for the dark window — robust on mobile, no portals. */
function NativeSelect({
  value,
  onChange,
  className,
  children,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  children: React.ReactNode;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-9 rounded-lg border border-white/12 bg-white/[0.04] px-2.5 text-[12px] text-white/85 outline-none transition-colors hover:border-white/25 focus:border-white/40 [&>option]:bg-[#16161a] [&>option]:text-white",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

/**
 * Image with a graceful fallback: if the asset is missing (the generator hasn't
 * been run, or a file 404s), render a labelled gradient tile instead of a
 * broken-image glyph.
 */
function DemoImg({
  src,
  alt,
  label,
  rounded,
  className,
}: {
  src: string;
  alt: string;
  label?: string;
  rounded?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-[linear-gradient(135deg,#1b1b22,#272733)] text-center text-[10px] font-medium text-white/35",
          rounded ? "rounded-full" : "",
          className,
        )}
      >
        {label ? <span className="px-1">{label}</span> : null}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

/* Small inline icons matching the app's lucide set (kept local to avoid extra
   imports churn). */
function UsersIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ShirtIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
    >
      <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
    </svg>
  );
}

function clearTimers(ref: React.MutableRefObject<number[]>) {
  ref.current.forEach((t) => window.clearTimeout(t));
  ref.current = [];
}

function buildDemoPrompt({
  model,
  location,
  outfit,
  variation,
}: {
  model: string;
  location: string;
  outfit: string;
  variation?: string;
}) {
  return [
    "Full-length editorial fashion photograph.",
    `Subject: ${model}.`,
    `Wearing: ${outfit}${variation ? ` (${variation})` : ""}.`,
    `On location: ${location}.`,
    "Natural light, shallow depth of field, candid pose, photoreal, 35mm.",
  ].join("\n");
}
