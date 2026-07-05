"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Sparkles, Camera, Loader2, ImagePlus, X, MapPin, Shirt, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { IMAGE_MODELS, DEFAULT_MODEL_ID, formatPrice } from "@/convex/lib/imageModels";
import { processImageForUpload } from "@/lib/image";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * The library entity a quick capture is anchored to — the page it's launched
 * from. It's pre-tagged and shown fixed; the other two entity types are
 * selectable in the modal.
 */
export type QuickCaptureAnchor =
  | { type: "location"; id: Id<"locations">; name: string }
  | { type: "outfit"; id: Id<"outfits">; name: string }
  | { type: "model"; id: Id<"models">; name: string };

const NONE = "__none__";

const ASPECTS: [string, string][] = [
  ["4:5", "Portrait 4:5"],
  ["1:1", "Square 1:1"],
  ["3:4", "Portrait 3:4"],
  ["2:3", "Portrait 2:3"],
  ["9:16", "Tall 9:16"],
  ["16:9", "Wide 16:9"],
  ["3:2", "Landscape 3:2"],
];

const ANCHOR_ICON = { location: MapPin, outfit: Shirt, model: User } as const;
const ANCHOR_LABEL = { location: "location", outfit: "product", model: "model" } as const;

/**
 * Quick-capture modal: generate a photo tagged straight to a location, product
 * or model — with no shoot. Two tabs: "Prompt" (text → generate) and "Capture"
 * (upload a real scene photo → composite). Results land in that entity's
 * gallery via `generate.generateQuick`.
 */
export function QuickCaptureModal({
  anchor,
  trigger,
}: {
  anchor: QuickCaptureAnchor;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const generate = useAction(api.generate.generateQuick);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  // Only load the pickers we actually need (skip the anchor's own type).
  const models =
    useQuery(api.models.list, anchor.type === "model" ? "skip" : {}) ?? [];
  const outfits =
    useQuery(api.outfits.list, anchor.type === "outfit" ? "skip" : {}) ?? [];
  const locations =
    useQuery(api.locations.list, anchor.type === "location" ? "skip" : {}) ?? [];

  const [modelSel, setModelSel] = useState<string>(NONE);
  const [outfitSel, setOutfitSel] = useState<string>(NONE);
  const [locationSel, setLocationSel] = useState<string>(NONE);
  const [variationId, setVariationId] = useState<string>(NONE);
  const [imageModelKey, setImageModelKey] = useState(DEFAULT_MODEL_ID);
  const [aspect, setAspect] = useState("4:5");
  const [count, setCount] = useState(1);
  const [posePrompt, setPosePrompt] = useState("");
  const [extraPrompt, setExtraPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Capture-tab upload state.
  const [captureStorageId, setCaptureStorageId] = useState<string | null>(null);
  const [capturePreview, setCapturePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Resolve the three ids, with the anchor fixed to its own entity.
  const locationId = (
    anchor.type === "location"
      ? anchor.id
      : locationSel !== NONE
        ? locationSel
        : undefined
  ) as Id<"locations"> | undefined;
  const outfitId = (
    anchor.type === "outfit"
      ? anchor.id
      : outfitSel !== NONE
        ? outfitSel
        : undefined
  ) as Id<"outfits"> | undefined;
  const modelId = (
    anchor.type === "model"
      ? anchor.id
      : modelSel !== NONE
        ? modelSel
        : undefined
  ) as Id<"models"> | undefined;

  const selectedOutfit =
    anchor.type === "outfit"
      ? undefined
      : outfits.find((o) => o._id === outfitSel);
  const variations = selectedOutfit?.variations ?? [];

  const AnchorIcon = ANCHOR_ICON[anchor.type];

  function resetAndClose() {
    setOpen(false);
    setCaptureStorageId(null);
    setCapturePreview(null);
    setPosePrompt("");
    setExtraPrompt("");
  }

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const processed = await processImageForUpload(file);
      const url = await generateUploadUrl();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": processed.type },
        body: processed,
      });
      if (!res.ok) throw new Error("upload failed");
      const { storageId } = (await res.json()) as { storageId: string };
      setCaptureStorageId(storageId);
      setCapturePreview(URL.createObjectURL(processed));
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function run(mode: "prompt" | "capture") {
    if (mode === "capture" && !captureStorageId) {
      toast.error("Add a photo first");
      return;
    }
    setSubmitting(true);
    try {
      const { generationIds } = await generate({
        mode,
        locationId,
        outfitId,
        modelId,
        variationId: variationId !== NONE ? variationId : undefined,
        modelKey: imageModelKey,
        aspectRatio: aspect,
        count: mode === "prompt" ? count : undefined,
        posePrompt: posePrompt.trim() || undefined,
        extraPrompt: extraPrompt.trim() || undefined,
        captureStorageId:
          mode === "capture"
            ? (captureStorageId as Id<"_storage">)
            : undefined,
      });
      toast.success(
        `Generating ${generationIds.length} photo${generationIds.length === 1 ? "" : "s"}…`,
      );
      resetAndClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start generation");
    } finally {
      setSubmitting(false);
    }
  }

  const activeModel = IMAGE_MODELS.find((m) => m.id === imageModelKey);

  // Shared entity + output pickers (rendered inside each tab).
  const pickers = (
    <div className="space-y-3">
      {anchor.type !== "model" && (
        <EntitySelect
          label="Model"
          value={modelSel}
          onChange={setModelSel}
          items={models.map((m) => ({ id: m._id, name: m.name ?? "Untitled" }))}
        />
      )}
      {anchor.type !== "outfit" && (
        <EntitySelect
          label="Product"
          value={outfitSel}
          onChange={(v) => {
            setOutfitSel(v);
            setVariationId(NONE);
          }}
          items={outfits.map((o) => ({ id: o._id, name: o.name }))}
        />
      )}
      {anchor.type !== "location" && (
        <EntitySelect
          label="Location"
          value={locationSel}
          onChange={setLocationSel}
          items={locations.map((l) => ({ id: l._id, name: l.name }))}
        />
      )}
      {variations.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">Variation</Label>
          <Select value={variationId} onValueChange={setVariationId}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Base outfit</SelectItem>
              {variations.map((vrt) => (
                <SelectItem key={vrt.id} value={vrt.id}>
                  {vrt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex gap-2">
        <div className="flex-1 space-y-1.5">
          <Label className="text-xs">AI model</Label>
          <Select value={imageModelKey} onValueChange={setImageModelKey}>
            <SelectTrigger size="sm" className="w-full min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IMAGE_MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  <span className="flex w-full items-center gap-2">
                    <span className="truncate">{m.label}</span>
                    <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">
                      {formatPrice(m.pricePerImage)}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-32 space-y-1.5">
          <Label className="text-xs">Aspect</Label>
          <Select value={aspect} onValueChange={setAspect}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASPECTS.map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (o ? setOpen(true) : resetAndClose())}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick capture</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <AnchorIcon className="size-3.5" />
            Tagged to this {ANCHOR_LABEL[anchor.type]}:{" "}
            <span className="text-foreground font-medium">{anchor.name}</span>
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="prompt">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="prompt">
              <Sparkles className="size-3.5" /> Prompt
            </TabsTrigger>
            <TabsTrigger value="capture">
              <Camera className="size-3.5" /> Capture
            </TabsTrigger>
          </TabsList>

          {/* Prompt: text-only generation. */}
          <TabsContent value="prompt" className="space-y-3 pt-2">
            {pickers}
            <div className="space-y-1.5">
              <Label className="text-xs">Pose / action (optional)</Label>
              <Textarea
                value={posePrompt}
                onChange={(e) => setPosePrompt(e.target.value)}
                placeholder="e.g. walking, looking over the shoulder"
                className="min-h-[52px] text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Extra direction (optional)</Label>
              <Textarea
                value={extraPrompt}
                onChange={(e) => setExtraPrompt(e.target.value)}
                placeholder="e.g. golden hour, film grain"
                className="min-h-[52px] text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Count</Label>
              <Select
                value={String(count)}
                onValueChange={(v) => setCount(Number(v))}
              >
                <SelectTrigger size="sm" className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeModel && (
                <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                  Est. ~{formatPrice(activeModel.pricePerImage * count)}
                </span>
              )}
            </div>
            <Button
              className="w-full"
              onClick={() => run("prompt")}
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Generate
            </Button>
          </TabsContent>

          {/* Capture: a real photo is the scene reference. */}
          <TabsContent value="capture" className="space-y-3 pt-2">
            {pickers}
            <div className="space-y-1.5">
              <Label className="text-xs">Scene photo</Label>
              {capturePreview ? (
                <div className="group border-border relative aspect-video w-full overflow-hidden rounded-lg border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={capturePreview}
                    alt="Captured scene"
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCaptureStorageId(null);
                      setCapturePreview(null);
                    }}
                    className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white"
                    aria-label="Remove photo"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <label className="border-border text-muted-foreground hover:border-primary/50 hover:text-foreground flex aspect-video w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs transition-colors">
                  {uploading ? (
                    <Loader2 className="size-6 animate-spin" />
                  ) : (
                    <ImagePlus className="size-6" />
                  )}
                  {uploading ? "Uploading…" : "Upload a photo of the scene"}
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => onPickFile(e.target.files?.[0])}
                  />
                </label>
              )}
              <p className="text-muted-foreground text-xs">
                Your photo is the scene — the model in their product is
                composited into it. The photo itself isn&apos;t stored.
              </p>
            </div>
            <Button
              className="w-full"
              onClick={() => run("capture")}
              disabled={submitting || uploading || !captureStorageId}
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Camera className="size-4" />
              )}
              Generate from photo
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function EntitySelect({
  label,
  value,
  onChange,
  items,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  items: { id: string; name: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>None</SelectItem>
          {items.map((it) => (
            <SelectItem key={it.id} value={it.id}>
              {it.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
