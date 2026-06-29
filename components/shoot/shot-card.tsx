"use client";

import { useState } from "react";
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
import { buildPrompt } from "@/convex/lib/prompt";
import {
  IMAGE_MODELS,
  DEFAULT_MODEL_ID,
  PROVIDER_LABEL,
  getImageModel,
  formatPrice,
  type ImageProvider,
} from "@/convex/lib/imageModels";
import type { Id } from "@/convex/_generated/dataModel";
import type {
  ShotDoc,
  LibraryData,
  GenerationDoc,
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
  scheduledAt,
}: {
  shot: ShotDoc;
  library: LibraryData;
  location: LocationInfo;
  scheduledAt?: number;
}) {
  const update = useMutation(api.shots.update);
  const remove = useMutation(api.shots.remove);
  const duplicateShot = useMutation(api.shots.duplicate);
  const removeGen = useMutation(api.generations.remove);
  const generate = useAction(api.generate.generateShot);
  const settings = useQuery(api.settings.get, {});
  const setDefaultModel = useMutation(api.settings.setDefaultImageModel);

  const [name, setName] = useState(shot.name ?? "");
  const [pose, setPose] = useState(shot.posePrompt ?? "");
  const [extra, setExtra] = useState(shot.extraPrompt ?? "");
  // Model selection: local override → workspace default (db) → built-in default.
  const [modelKeyOverride, setModelKeyOverride] = useState<string | null>(null);
  const desiredKey =
    modelKeyOverride ?? settings?.defaultImageModelKey ?? DEFAULT_MODEL_ID;
  const modelKey = getImageModel(desiredKey) ? desiredKey : DEFAULT_MODEL_ID;
  const [generating, setGenerating] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const outfit = library.outfits.find((o) => o._id === shot.outfitId);
  const variations = outfit?.variations ?? [];
  const selectedVars = shot.selectedVariationIds ?? [];

  type ShotPatch = {
    name?: string;
    modelId?: Id<"models"> | null;
    outfitId?: Id<"outfits"> | null;
    selectedVariationIds?: string[];
    posePrompt?: string;
    extraPrompt?: string;
    styleId?: Id<"presets"> | null;
    cameraId?: Id<"presets"> | null;
    lightingId?: Id<"presets"> | null;
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
    shot: { name: shot.name, posePrompt: pose, extraPrompt: extra },
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
  }));

  return (
    <Card className="gap-3 p-3">
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
        <NullableSelect
          placeholder="Model"
          value={shot.modelId}
          onChange={(v) => save({ modelId: (v as Id<"models">) ?? null })}
          options={library.models.map((m) => ({ value: m._id, label: m.name }))}
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
              onDelete={() => removeGen({ id: g._id })}
              onOpen={() => {
                const i = succeeded.findIndex((s) => s._id === g._id);
                if (i !== -1) setLightboxIndex(i);
              }}
            />
          ))}
        </div>
      )}

      <ImageLightbox
        images={lightboxImages}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />
    </Card>
  );
}

function GenerationTile({
  gen,
  onDelete,
  onOpen,
}: {
  gen: GenerationDoc;
  onDelete: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="group bg-muted/50 relative aspect-[3/4] overflow-hidden rounded-md border">
      {gen.status === "succeeded" && gen.imageUrl ? (
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
        <div className="text-muted-foreground flex h-full w-full items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}
      <button
        onClick={onDelete}
        className="absolute right-1 top-1 rounded bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Delete generation"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
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
