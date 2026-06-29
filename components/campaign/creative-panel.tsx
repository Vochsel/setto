"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  Trash2,
  AlertCircle,
  Image as ImageIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ImageLightbox } from "@/components/image-lightbox";
import {
  IMAGE_MODELS,
  DEFAULT_MODEL_ID,
  PROVIDER_LABEL,
  getImageModel,
  formatPrice,
  type ImageProvider,
} from "@/convex/lib/imageModels";
import { ASPECT_RATIOS } from "@/lib/format";
import type { Id } from "@/convex/_generated/dataModel";

interface CreativeDoc {
  _id: Id<"campaignCreatives">;
  status: "queued" | "generating" | "succeeded" | "failed";
  imageUrl?: string;
  error?: string;
  modelLabel?: string;
}

const COUNTS = [1, 2, 3, 4];

export function CreativePanel({
  campaignId,
  aspectRatio,
  hasShots,
}: {
  campaignId: Id<"campaigns">;
  aspectRatio?: string;
  hasShots: boolean;
}) {
  const creatives = useQuery(api.campaignCreatives.listByCampaign, {
    campaignId,
  }) as CreativeDoc[] | undefined;
  const update = useMutation(api.campaigns.update);
  const removeCreative = useMutation(api.campaignCreatives.remove);
  const generateCreative = useAction(api.generate.generateCreative);
  const settings = useQuery(api.settings.get, {});
  const setDefaultModel = useMutation(api.settings.setDefaultImageModel);

  const [modelKeyOverride, setModelKeyOverride] = useState<string | null>(null);
  const desiredKey =
    modelKeyOverride ?? settings?.defaultImageModelKey ?? DEFAULT_MODEL_ID;
  const modelKey = getImageModel(desiredKey) ? desiredKey : DEFAULT_MODEL_ID;
  const [count, setCount] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  async function runGenerate() {
    setGenerating(true);
    try {
      const r = await generateCreative({ campaignId, modelKey, count });
      toast.success(`Generating ${r.creativeIds.length} creative(s)…`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  const succeeded = (creatives ?? []).filter(
    (g) => g.status === "succeeded" && g.imageUrl,
  );
  const lightboxImages = succeeded.map((g) => ({
    url: g.imageUrl,
    caption: g.modelLabel,
  }));

  const estCost = (getImageModel(modelKey)?.pricePerImage ?? 0) * count;

  return (
    <Card className="gap-4 p-4">
      <div>
        <h2 className="text-sm font-medium">Creatives</h2>
        <p className="text-muted-foreground text-xs">
          Generate finished ads from your shots, inspiration and copy.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1.5">
          <Label className="text-xs">Aspect ratio</Label>
          <Select
            value={aspectRatio ?? "4:5"}
            onValueChange={(v) => update({ id: campaignId, aspectRatio: v })}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASPECT_RATIOS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Count</Label>
          <Select
            value={String(count)}
            onValueChange={(v) => setCount(Number(v))}
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUNTS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} image{n > 1 ? "s" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label className="text-xs">Image model</Label>
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
      </div>

      {!hasShots && (
        <p className="text-muted-foreground rounded-md border border-dashed px-2.5 py-1.5 text-[11px]">
          Tip: pick some shots above so the ad features your photos.
        </p>
      )}

      <Button onClick={runGenerate} disabled={generating} className="w-full">
        {generating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        Generate {count > 1 ? `×${count}` : "creative"}
      </Button>
      <p className="text-muted-foreground -mt-1 text-right text-[11px] tabular-nums">
        Est. ~{formatPrice(estCost)} · {count} image{count > 1 ? "s" : ""}
      </p>

      {creatives === undefined ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="bg-muted/50 aspect-[3/4] animate-pulse rounded-md"
            />
          ))}
        </div>
      ) : creatives.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center text-xs">
          <ImageIcon className="h-5 w-5" />
          No creatives yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {creatives.map((g) => (
            <CreativeTile
              key={g._id}
              creative={g}
              onDelete={() => removeCreative({ id: g._id })}
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

function CreativeTile({
  creative,
  onDelete,
  onOpen,
}: {
  creative: CreativeDoc;
  onDelete: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="group bg-muted/50 relative aspect-[3/4] overflow-hidden rounded-md border">
      {creative.status === "succeeded" && creative.imageUrl ? (
        <button
          type="button"
          onClick={onOpen}
          className="block h-full w-full cursor-zoom-in"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={creative.imageUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        </button>
      ) : creative.status === "failed" ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="text-destructive flex h-full w-full flex-col items-center justify-center gap-1 p-1 text-center">
              <AlertCircle className="h-4 w-4" />
              <span className="text-[9px] leading-tight">Failed</span>
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-60">{creative.error}</TooltipContent>
        </Tooltip>
      ) : (
        <div className="text-muted-foreground flex h-full w-full items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}
      <button
        onClick={onDelete}
        className="absolute right-1 top-1 rounded bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Delete creative"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}
