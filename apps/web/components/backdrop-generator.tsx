"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  Loader2,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  selectableImageModels,
  DEFAULT_MODEL_ID,
  PROVIDER_LABEL,
  formatPrice,
  type ImageProvider,
} from "@/convex/lib/imageModels";
import { cn, convexErrorMessage } from "@/lib/utils";
import type { Id } from "@/convex/_generated/dataModel";

/** Providers that generate from text alone (fal endpoints here are image editors
 * that need an input image, so they're excluded for from-scratch backdrops). */
const BACKDROP_PROVIDERS: ImageProvider[] = ["google", "openai"];
const BACKDROP_MODELS = selectableImageModels().filter((m) =>
  BACKDROP_PROVIDERS.includes(m.provider),
);
const COUNTS = [1, 2, 4, 6];

/**
 * Prompt a location's backdrop: describe an (interior) scene, generate several
 * candidates asynchronously, watch them stream in, and keep the ones you like as
 * the location's reference images. Self-contained given a `locationId`.
 */
export function BackdropGenerator({
  locationId,
  defaultPrompt,
  defaultInterior = true,
}: {
  locationId: Id<"locations">;
  defaultPrompt?: string;
  defaultInterior?: boolean;
}) {
  const generate = useAction(api.generate.generateBackdrops);
  const backdrops = useQuery(api.locations.listBackdrops, { locationId });
  const keep = useMutation(api.locations.keepBackdrop);
  const unkeep = useMutation(api.locations.unkeepBackdrop);
  const remove = useMutation(api.locations.removeBackdrop);
  const settings = useQuery(api.settings.get, {});

  const [prompt, setPrompt] = useState(defaultPrompt ?? "");
  const [interior, setInterior] = useState(defaultInterior);
  const [count, setCount] = useState(4);
  const [modelKey, setModelKey] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const desired = modelKey ?? settings?.defaultImageModelKey ?? DEFAULT_MODEL_ID;
  // Fall back to the default if the workspace default is a fal editor (not
  // usable for from-scratch backdrops).
  const genModel = BACKDROP_MODELS.some((m) => m.id === desired)
    ? desired
    : DEFAULT_MODEL_ID;

  async function run() {
    setGenerating(true);
    try {
      await generate({
        locationId,
        description: prompt.trim() || undefined,
        interior,
        modelKey: genModel,
        count,
      });
    } catch (e) {
      toast.error(convexErrorMessage(e, "Could not start generation"));
    } finally {
      setGenerating(false);
    }
  }

  const anyPending = backdrops?.some(
    (b) => b.status === "queued" || b.status === "generating",
  );
  const keptCount = backdrops?.filter((b) => b.kept).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="bg-muted/30 grid gap-3 rounded-lg border p-3">
        <div className="grid gap-2">
          <Label htmlFor="bd-prompt" className="flex items-center gap-1.5">
            <Wand2 className="h-3.5 w-3.5" /> Describe the scene
          </Label>
          <Textarea
            id="bd-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="a sunlit Scandinavian living room with oak floors, linen sofa and tall windows…"
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={interior} onCheckedChange={setInterior} />
            Interior scene
          </label>

          <div className="flex items-center gap-2">
            <Label className="text-muted-foreground text-xs">Count</Label>
            <Select
              value={String(count)}
              onValueChange={(v) => setCount(Number(v))}
            >
              <SelectTrigger size="sm" className="w-16">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COUNTS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Select value={genModel} onValueChange={(v) => setModelKey(v)}>
            <SelectTrigger size="sm" className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BACKDROP_PROVIDERS.map((prov) => (
                <SelectGroup key={prov}>
                  <SelectLabel>{PROVIDER_LABEL[prov]}</SelectLabel>
                  {BACKDROP_MODELS.filter((m) => m.provider === prov).map(
                    (m) => (
                      <SelectItem key={m.id} value={m.id}>
                        <span className="flex w-full items-center justify-between gap-3">
                          <span className="truncate">{m.label}</span>
                          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                            ~{formatPrice(m.pricePerImage)}
                          </span>
                        </span>
                      </SelectItem>
                    ),
                  )}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            size="sm"
            onClick={run}
            disabled={generating}
            className="ml-auto"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate
          </Button>
        </div>
      </div>

      {backdrops && backdrops.length > 0 && (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">
            {anyPending
              ? "Generating… tap a candidate to keep it."
              : `Tap a candidate to keep it as a reference.${keptCount ? ` ${keptCount} kept.` : ""}`}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {backdrops.map((b) => {
              const pending =
                b.status === "queued" || b.status === "generating";
              return (
                <div
                  key={b._id}
                  className={cn(
                    "group bg-muted relative aspect-video overflow-hidden rounded-lg border",
                    b.kept && "ring-primary ring-2",
                  )}
                >
                  {b.status === "succeeded" && b.thumbUrl ? (
                    <button
                      type="button"
                      onClick={() =>
                        (b.kept
                          ? unkeep({ id: b._id })
                          : keep({ id: b._id })
                        ).catch((e) =>
                          toast.error(convexErrorMessage(e, "Could not update")),
                        )
                      }
                      className="block h-full w-full"
                      title={b.kept ? "Remove from references" : "Keep as reference"}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={b.thumbUrl}
                        alt={b.userPrompt ?? "Backdrop candidate"}
                        className="h-full w-full object-cover"
                      />
                      {b.kept && (
                        <span className="bg-primary text-primary-foreground absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full shadow">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </button>
                  ) : b.status === "failed" ? (
                    <div className="text-muted-foreground flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="line-clamp-2 text-[11px]">
                        {b.error ?? "Generation failed"}
                      </span>
                    </div>
                  ) : (
                    <div className="text-muted-foreground flex h-full w-full flex-col items-center justify-center gap-1.5">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span className="text-[11px]">
                        {b.progressLabel ?? "Queued…"}
                      </span>
                    </div>
                  )}

                  {!pending && (
                    <button
                      type="button"
                      onClick={() =>
                        remove({ id: b._id }).catch(() =>
                          toast.error("Could not remove"),
                        )
                      }
                      title="Discard"
                      className="bg-background/80 text-foreground hover:bg-destructive hover:text-destructive-foreground absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border opacity-0 shadow transition-opacity group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
