"use client";

import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  Trash2,
  ChevronDown,
  Eye,
  AlertCircle,
  Layers,
  Copy,
  Check,
  Shirt,
  Film,
  Play,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDelete } from "@/components/confirm-delete";
import { ImageLightbox } from "@/components/image-lightbox";
import { cn } from "@/lib/utils";
import { buildPrompt, BASE_VARIATION_ID } from "@/convex/lib/prompt";
import {
  IMAGE_MODELS,
  DEFAULT_MODEL_ID,
  PROVIDER_LABEL,
  getImageModel,
  formatPrice,
  type ImageProvider,
} from "@/convex/lib/imageModels";
import { AnimatePopover } from "@/components/animate-popover";
import { FavoriteButton, ReviewBadges } from "@/components/review-controls";
import { ASPECT_RATIOS } from "@/lib/format";
import type { Id } from "@/convex/_generated/dataModel";

/** Sentinel for "no fixed aspect ratio — let the model decide". */
const AUTO_ASPECT = "__auto__";
import type {
  ShotDoc,
  LibraryData,
  ModelOption,
  GenerationDoc,
  VideoDoc,
} from "@/components/shoot/types";

const NONE = "__none__";

interface LocationInfo {
  name?: string;
  address?: string;
  promptDescriptor?: string;
  streetViewUrls?: { url: string }[];
}

export function ShotCard({
  shot,
  library,
  location,
  castModelIds,
  scheduledAt,
  highlight,
}: {
  shot: ShotDoc;
  library: LibraryData;
  location: LocationInfo;
  /** Models cast at this shoot location — pinned to the top of the Model picker. */
  castModelIds?: Id<"models">[];
  scheduledAt?: number;
  /** Deep-link target — scroll into view and ring this shot. */
  highlight?: boolean;
}) {
  const update = useMutation(api.shots.update);
  const remove = useMutation(api.shots.remove);
  const duplicateShot = useMutation(api.shots.duplicate);
  const removeGen = useMutation(api.generations.remove);
  const removeVideo = useMutation(api.videos.remove);
  const generate = useAction(api.generate.generateShot);
  const settings = useQuery(api.settings.get, {});
  const setDefaultModel = useMutation(api.settings.setDefaultImageModel);

  const [name, setName] = useState(shot.name ?? "");
  const [pose, setPose] = useState(shot.posePrompt ?? "");
  const [clothing, setClothing] = useState(shot.clothingPrompt ?? "");
  const [extra, setExtra] = useState(shot.extraPrompt ?? "");
  // Model selection: local override → workspace default (db) → built-in default.
  const [modelKeyOverride, setModelKeyOverride] = useState<string | null>(null);
  const desiredKey =
    modelKeyOverride ?? settings?.defaultImageModelKey ?? DEFAULT_MODEL_ID;
  const modelKey = getImageModel(desiredKey) ? desiredKey : DEFAULT_MODEL_ID;
  const [generating, setGenerating] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [videoLightboxIndex, setVideoLightboxIndex] = useState<number | null>(
    null,
  );

  // Deep-link: when this is the targeted shot, scroll it into view. The panel
  // has usually just mounted, so scroll *after* layout settles — a synchronous
  // scrollIntoView here fires before the browser positions the card and lands
  // nowhere. Defer past paint (double rAF), then re-align once more after
  // images settle so the target stays centered.
  useEffect(() => {
    if (!highlight) return;
    const scroll = () =>
      document
        .getElementById(`shot-${shot._id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(scroll);
    });
    const settle = window.setTimeout(scroll, 500);
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
      clearTimeout(settle);
    };
  }, [highlight, shot._id]);

  const outfit = library.outfits.find((o) => o._id === shot.outfitId);
  const variations = outfit?.variations ?? [];
  const selectedVars = shot.selectedVariationIds ?? [];

  type ShotPatch = {
    name?: string;
    modelId?: Id<"models"> | null;
    outfitId?: Id<"outfits"> | null;
    selectedVariationIds?: string[];
    posePrompt?: string;
    clothingPrompt?: string;
    extraPrompt?: string;
    styleId?: Id<"presets"> | null;
    cameraId?: Id<"presets"> | null;
    lightingId?: Id<"presets"> | null;
    aspectRatio?: string | null;
  };
  function save(patch: ShotPatch) {
    update({ id: shot._id, ...patch }).catch(() => toast.error("Save failed"));
  }

  function toggleVariation(id: string) {
    const next = selectedVars.includes(id)
      ? selectedVars.filter((x) => x !== id)
      : [...selectedVars, id];
    save({ selectedVariationIds: next });
  }

  async function runGenerate() {
    setGenerating(true);
    try {
      const r = await generate({ shotId: shot._id, modelKey });
      toast.success(`Generating ${r.generationIds.length} image(s)…`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  // Client-side prompt preview (mirrors the server pipeline).
  const model = library.models.find((m) => m._id === shot.modelId);
  const style = library.styles.find((p) => p._id === shot.styleId);
  const camera = library.cameras.find((p) => p._id === shot.cameraId);
  const lighting = library.lightings.find((p) => p._id === shot.lightingId);
  const previewVariation = variations.find((v) => selectedVars.includes(v.id));
  const preview = buildPrompt({
    shot: {
      name: shot.name,
      posePrompt: pose,
      clothingPrompt: clothing,
      extraPrompt: extra,
    },
    model: model
      ? {
          name: model.name,
          promptDescriptor: model.promptDescriptor,
          attributes: model.attributes ?? null,
        }
      : null,
    outfit: outfit
      ? { name: outfit.name, promptDescriptor: outfit.promptDescriptor }
      : null,
    variation: previewVariation
      ? {
          name: previewVariation.name,
          promptDescriptor: previewVariation.promptDescriptor,
        }
      : null,
    location: {
      name: location.name,
      address: location.address,
      promptDescriptor: location.promptDescriptor,
      streetViewUrls: location.streetViewUrls?.map((s) => s.url),
    },
    style: style ? { name: style.name, promptDescriptor: style.promptDescriptor } : null,
    camera: camera ? { name: camera.name, promptDescriptor: camera.promptDescriptor } : null,
    lighting: lighting
      ? { name: lighting.name, promptDescriptor: lighting.promptDescriptor }
      : null,
    scheduledAt,
  });

  const genCount = selectedVars.length || 1;

  const succeeded = shot.generations.filter(
    (g) => g.status === "succeeded" && g.imageUrl,
  );
  const lightboxImages = succeeded.map((g) => ({
    url: g.imageUrl,
    caption: g.modelLabel,
    generationId: g._id,
    mediaId: g._id,
    rating: g.rating,
    reviewStatus: g.reviewStatus,
    favorite: g.favorite,
  }));

  // Videos across all of this shot's images, newest first (the per-generation
  // arrays are already ordered desc). Surfaced in their own row below the grid.
  const allVideos = shot.generations.flatMap((g) => g.videos ?? []);
  const succeededVideos = allVideos.filter(
    (vd) => vd.status === "succeeded" && vd.videoUrl,
  );
  const videoLightbox = succeededVideos.map((vd) => ({
    kind: "video" as const,
    url: vd.videoUrl,
    posterUrl: vd.posterUrl,
    caption: vd.modelLabel,
    mediaId: vd._id,
    rating: vd.rating,
    reviewStatus: vd.reviewStatus,
    favorite: vd.favorite,
  }));

  return (
    <Card
      id={`shot-${shot._id}`}
      className={cn(
        "scroll-mt-20 gap-3 p-3",
        highlight && "ring-primary ring-2",
      )}
    >
      <div className="flex items-center gap-2">
        <Input
          value={name}
          placeholder={`Shot ${shot.order + 1}`}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== (shot.name ?? "") && save({ name })}
          className="h-8 border-transparent bg-transparent px-1 text-sm font-medium shadow-none focus-visible:border-input"
        />
        <Button
          variant="ghost"
          size="icon"
          title="Duplicate shot"
          className="text-muted-foreground hover:text-foreground size-7 shrink-0"
          onClick={async () => {
            await duplicateShot({ id: shot._id });
            toast.success("Shot duplicated");
          }}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <ConfirmDelete
          title="Delete this shot?"
          onConfirm={async () => {
            await remove({ id: shot._id });
            toast.success("Shot deleted");
          }}
          trigger={
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive size-7 shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ModelSelect
          value={shot.modelId}
          onChange={(v) => save({ modelId: (v as Id<"models">) ?? null })}
          models={library.models}
          castIds={castModelIds ?? []}
        />
        <NullableSelect
          placeholder="Wardrobe"
          value={shot.outfitId}
          onChange={(v) =>
            save({
              outfitId: (v as Id<"outfits">) ?? null,
              selectedVariationIds: [],
            })
          }
          options={library.outfits.map((o) => ({ value: o._id, label: o.name }))}
        />
      </div>

      {variations.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <Layers className="h-3 w-3" /> Variations
            <span className="text-muted-foreground/60">
              · tap to include (one image each)
            </span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            {/* Default = the base outfit with no variation applied. Offered once
                there's more than one variation so a batch can include the
                original look alongside the variations. */}
            {variations.length > 1 && (
              <button
                type="button"
                onClick={() => toggleVariation(BASE_VARIATION_ID)}
                title="The original outfit, no variation applied"
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                  selectedVars.includes(BASE_VARIATION_ID)
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border hover:bg-muted",
                )}
              >
                <span className="max-w-28 truncate">Default</span>
                {selectedVars.includes(BASE_VARIATION_ID) ? (
                  <Check className="text-primary h-3 w-3 shrink-0" />
                ) : null}
              </button>
            )}
            {variations.map((v) => {
              const active = selectedVars.includes(v.id);
              const thumb = v.imageUrls?.[0]?.url;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => toggleVariation(v.id)}
                  title={v.name}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 text-xs transition-colors",
                    thumb ? "pl-0.5" : "pl-2.5",
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt=""
                      className="size-5 rounded-full object-cover"
                    />
                  ) : null}
                  <span className="max-w-28 truncate">{v.name}</span>
                  {active ? (
                    <Check className="text-primary h-3 w-3 shrink-0" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <span className="text-muted-foreground flex items-center gap-1 text-xs">
          <Shirt className="h-3 w-3" /> Other clothing
          <span className="text-muted-foreground/60">
            · besides the wardrobe piece
          </span>
        </span>
        <Textarea
          value={clothing}
          onChange={(e) => setClothing(e.target.value)}
          onBlur={() =>
            clothing !== (shot.clothingPrompt ?? "") &&
            save({ clothingPrompt: clothing })
          }
          placeholder="e.g. straight-leg blue jeans and white sneakers — leave blank to let the AI pick something that suits the person & location"
          className="min-h-[44px] text-sm"
        />
      </div>

      <Textarea
        value={pose}
        onChange={(e) => setPose(e.target.value)}
        onBlur={() => pose !== (shot.posePrompt ?? "") && save({ posePrompt: pose })}
        placeholder="Pose & action — e.g. walking, looking over shoulder, hands in pockets…"
        className="min-h-[52px] text-sm"
      />

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="text-muted-foreground -ml-1 h-7">
            <ChevronDown className="h-3.5 w-3.5" /> Style, camera &amp; lighting
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-2">
          <div className="grid grid-cols-3 gap-2">
            <NullableSelect
              placeholder="Style"
              value={shot.styleId}
              onChange={(v) => save({ styleId: (v as Id<"presets">) ?? null })}
              options={library.styles.map((p) => ({ value: p._id, label: p.name }))}
            />
            <NullableSelect
              placeholder="Camera"
              value={shot.cameraId}
              onChange={(v) => save({ cameraId: (v as Id<"presets">) ?? null })}
              options={library.cameras.map((p) => ({ value: p._id, label: p.name }))}
            />
            <NullableSelect
              placeholder="Lighting"
              value={shot.lightingId}
              onChange={(v) => save({ lightingId: (v as Id<"presets">) ?? null })}
              options={library.lightings.map((p) => ({ value: p._id, label: p.name }))}
            />
          </div>
          <Textarea
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            onBlur={() =>
              extra !== (shot.extraPrompt ?? "") && save({ extraPrompt: extra })
            }
            placeholder="Extra direction (freeform)…"
            className="min-h-[44px] text-sm"
          />
        </CollapsibleContent>
      </Collapsible>

      {/* Generate bar — model picker on its own row so the button never clips */}
      <div className="space-y-2">
        <Select
          value={modelKey}
          onValueChange={(v) => {
            setModelKeyOverride(v);
            setDefaultModel({ modelKey: v }).catch(() => {});
          }}
        >
          <SelectTrigger size="sm" className="w-full min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["google", "openai", "fal"] as ImageProvider[]).map((prov) => (
              <SelectGroup key={prov}>
                <SelectLabel>{PROVIDER_LABEL[prov]}</SelectLabel>
                {IMAGE_MODELS.filter((m) => m.provider === prov).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="flex w-full items-center justify-between gap-3">
                      <span className="truncate">{m.label}</span>
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        ~{formatPrice(m.pricePerImage)}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Select
            value={shot.aspectRatio ?? AUTO_ASPECT}
            onValueChange={(v) =>
              save({ aspectRatio: v === AUTO_ASPECT ? null : v })
            }
          >
            <SelectTrigger
              size="sm"
              className="w-24 shrink-0"
              title="Output aspect ratio"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUTO_ASPECT}>Auto</SelectItem>
              {ASPECT_RATIOS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="size-8 shrink-0">
                <Eye className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96" align="start">
              <p className="mb-2 text-xs font-medium">Assembled prompt</p>
              <pre className="bg-muted/50 text-muted-foreground max-h-72 overflow-auto whitespace-pre-wrap rounded-md p-2 font-mono text-[11px] leading-relaxed">
                {preview.prompt}
              </pre>
            </PopoverContent>
          </Popover>

          <Button
            size="sm"
            className="flex-1"
            onClick={runGenerate}
            disabled={generating}
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate {genCount > 1 ? `×${genCount}` : ""}
          </Button>
        </div>
        <p className="text-muted-foreground text-right text-[11px] tabular-nums">
          Est. ~
          {formatPrice(
            (getImageModel(modelKey)?.pricePerImage ?? 0) * genCount,
          )}{" "}
          · {genCount} image{genCount > 1 ? "s" : ""}
        </p>
      </div>

      {shot.generations.length > 0 && (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {shot.generations.map((g) => (
            <GenerationTile
              key={g._id}
              gen={g}
              onOpen={() => {
                const i = succeeded.findIndex((s) => s._id === g._id);
                if (i !== -1) setLightboxIndex(i);
              }}
            />
          ))}
        </div>
      )}

      {allVideos.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <Film className="h-3 w-3" /> Videos
            <span className="text-muted-foreground/60">
              · animated from images above
            </span>
          </span>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {allVideos.map((vd) => (
              <VideoTile
                key={vd._id}
                video={vd}
                onOpen={() => {
                  const i = succeededVideos.findIndex((s) => s._id === vd._id);
                  if (i !== -1) setVideoLightboxIndex(i);
                }}
              />
            ))}
          </div>
        </div>
      )}

      <ImageLightbox
        images={lightboxImages}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onDelete={(img) => {
          if (img.mediaId) removeGen({ id: img.mediaId as Id<"generations"> });
          setLightboxIndex(null);
        }}
      />
      <ImageLightbox
        images={videoLightbox}
        index={videoLightboxIndex}
        onIndexChange={setVideoLightboxIndex}
        onClose={() => setVideoLightboxIndex(null)}
        onDelete={(img) => {
          if (img.mediaId) removeVideo({ id: img.mediaId as Id<"videos"> });
          setVideoLightboxIndex(null);
        }}
      />
    </Card>
  );
}

function GenerationTile({
  gen,
  onOpen,
}: {
  gen: GenerationDoc;
  onOpen: () => void;
}) {
  const succeeded = gen.status === "succeeded" && gen.imageUrl;
  return (
    <div className="group bg-muted/50 relative aspect-[3/4] overflow-hidden rounded-md border">
      {succeeded ? (
        <button
          type="button"
          onClick={onOpen}
          className="block h-full w-full cursor-zoom-in"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={gen.imageUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        </button>
      ) : gen.status === "failed" ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="text-destructive flex h-full w-full flex-col items-center justify-center gap-1 p-1 text-center">
              <AlertCircle className="h-4 w-4" />
              <span className="text-[9px] leading-tight">Failed</span>
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-60">{gen.error}</TooltipContent>
        </Tooltip>
      ) : (
        <ProgressOverlay label={gen.progressLabel} progress={gen.progress} />
      )}

      {/* Animate this image into a video (one or many). */}
      {succeeded && (
        <AnimatePopover
          generationId={gen._id}
          trigger={
            <button
              className="absolute bottom-1 left-1 z-10 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Animate into video"
            >
              <Film className="h-3 w-3" /> Animate
            </button>
          }
        />
      )}

      {succeeded && (
        <>
          <FavoriteButton
            mediaId={gen._id}
            favorite={gen.favorite}
            theme="dark"
            className={cn(
              "absolute bottom-1 right-1 z-10 size-6 opacity-0 transition-opacity group-hover:opacity-100",
              gen.favorite && "opacity-100",
            )}
          />
          <ReviewBadges
            rating={gen.rating}
            reviewStatus={gen.reviewStatus}
            className="absolute left-1 top-1 z-10"
          />
        </>
      )}
    </div>
  );
}

/** Spinner + (when available) a live stage label and thin progress bar. */
function ProgressOverlay({
  label,
  progress,
}: {
  label?: string;
  progress?: number;
}) {
  return (
    <div className="text-muted-foreground flex h-full w-full flex-col items-center justify-center gap-1.5 p-1.5 text-center">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label ? (
        <span className="text-[9px] leading-tight">{label}</span>
      ) : null}
      {typeof progress === "number" ? (
        <div className="bg-muted h-1 w-full overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-all"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

/** A single video render tile: poster + play, progress, or error. */
function VideoTile({
  video,
  onOpen,
}: {
  video: VideoDoc;
  onOpen: () => void;
}) {
  const succeeded = video.status === "succeeded" && video.videoUrl;
  return (
    <div className="group bg-muted/50 relative aspect-[3/4] overflow-hidden rounded-md border">
      {succeeded ? (
        <button
          type="button"
          onClick={onOpen}
          className="relative block h-full w-full cursor-pointer"
        >
          {video.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={video.posterUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="bg-muted h-full w-full" />
          )}
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex size-7 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/20 backdrop-blur">
              <Play className="h-3.5 w-3.5 translate-x-px" fill="currentColor" />
            </span>
          </span>
        </button>
      ) : video.status === "failed" ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="text-destructive flex h-full w-full flex-col items-center justify-center gap-1 p-1 text-center">
              <AlertCircle className="h-4 w-4" />
              <span className="text-[9px] leading-tight">Failed</span>
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-60">{video.error}</TooltipContent>
        </Tooltip>
      ) : (
        <>
          {/* Faint poster behind the progress so you can see what's animating. */}
          {video.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={video.posterUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-30"
            />
          ) : null}
          <div className="absolute inset-0">
            <ProgressOverlay
              label={video.progressLabel}
              progress={video.progress}
            />
          </div>
        </>
      )}
      {succeeded && (
        <>
          <FavoriteButton
            mediaId={video._id}
            favorite={video.favorite}
            theme="dark"
            className={cn(
              "absolute bottom-1 right-1 z-10 size-6 opacity-0 transition-opacity group-hover:opacity-100",
              video.favorite && "opacity-100",
            )}
          />
          <ReviewBadges
            rating={video.rating}
            reviewStatus={video.reviewStatus}
            className="absolute left-1 top-1 z-10"
          />
        </>
      )}
    </div>
  );
}

/** Round headshot for a model, falling back to its initial when none exists. */
function ModelAvatar({ url, name }: { url?: string; name: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="size-5 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="bg-muted text-muted-foreground flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-medium">
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

/**
 * Model picker that pins the shoot's cast (the models chosen for this location)
 * above the full library, each shown with a headshot so the right actor is easy
 * to spot. Falls back to a plain list when nothing is cast yet.
 */
function ModelSelect({
  value,
  onChange,
  models,
  castIds,
}: {
  value?: string;
  onChange: (value: string | undefined) => void;
  models: ModelOption[];
  castIds: string[];
}) {
  const cast = new Set<string>(castIds);
  const pinned = models.filter((m) => cast.has(m._id));
  const rest = models.filter((m) => !cast.has(m._id));
  const item = (m: ModelOption) => (
    <SelectItem key={m._id} value={m._id} textValue={m.name}>
      <ModelAvatar url={m.imageUrls?.[0]?.url} name={m.name} />
      <span className="truncate">{m.name}</span>
    </SelectItem>
  );
  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => onChange(v === NONE ? undefined : v)}
    >
      <SelectTrigger size="sm" className="w-full">
        <SelectValue placeholder="Model" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>
          <span className="text-muted-foreground">None</span>
        </SelectItem>
        {pinned.length > 0 && (
          <SelectGroup>
            <SelectSeparator />
            <SelectLabel>For this shoot</SelectLabel>
            {pinned.map(item)}
          </SelectGroup>
        )}
        {rest.length > 0 && (
          <SelectGroup>
            {pinned.length > 0 && <SelectSeparator />}
            {pinned.length > 0 && <SelectLabel>All models</SelectLabel>}
            {rest.map(item)}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}

function NullableSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value?: string;
  onChange: (value: string | undefined) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => onChange(v === NONE ? undefined : v)}
    >
      <SelectTrigger size="sm" className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>
          <span className="text-muted-foreground">None</span>
        </SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
