"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  variationModels,
  DEFAULT_VARIATION_MODEL_ID,
  getImageModel,
  formatPrice,
} from "@/convex/lib/imageModels";
import type { Id } from "@/convex/_generated/dataModel";

const COUNTS = [1, 2, 3, 4];

/**
 * Popover to spin off realistic variations of a finished image (image-to-image):
 * pick a cheap editor model, how many, and an optional extra prompt. Shared by
 * the shot card tiles and the fullscreen lightbox — pass your own `trigger`.
 */
export function VariationsPopover({
  generationId,
  trigger,
  align = "start",
}: {
  generationId: Id<"generations">;
  trigger: React.ReactNode;
  align?: "start" | "center" | "end";
}) {
  const generateVariations = useAction(api.generate.generateVariations);
  const [open, setOpen] = useState(false);
  const [modelKey, setModelKey] = useState(DEFAULT_VARIATION_MODEL_ID);
  const [count, setCount] = useState(2);
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const models = variationModels();
  const pricePer = getImageModel(modelKey)?.pricePerImage ?? 0;

  async function run() {
    setSubmitting(true);
    try {
      const r = await generateVariations({
        generationId,
        modelKey,
        count,
        prompt: prompt.trim() || undefined,
      });
      toast.success(`Generating ${r.generationIds.length} variation(s)…`);
      setOpen(false);
      setPrompt("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start variations");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-80 space-y-3" align={align}>
        <div>
          <p className="text-xs font-medium">Generate variations</p>
          <p className="text-muted-foreground text-[11px]">
            Realistic image-to-image takes off this photo — pick any editing model.
          </p>
        </div>

        <Select value={modelKey} onValueChange={setModelKey}>
          <SelectTrigger size="sm" className="w-full min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                <span className="flex w-full items-center justify-between gap-3">
                  <span className="truncate">{m.label}</span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    ~{formatPrice(m.pricePerImage)}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Select value={String(count)} onValueChange={(v) => setCount(Number(v))}>
            <SelectTrigger size="sm" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUNTS.map((c) => (
                <SelectItem key={c} value={String(c)}>
                  {c} image{c > 1 ? "s" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground text-xs tabular-nums">
            Est. ~{formatPrice(pricePer * count)}
          </span>
        </div>

        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Optional direction — e.g. change the pose, golden-hour light, looking away… (leave blank for a natural variation)"
          className="min-h-[64px] text-sm"
        />

        <Button size="sm" className="w-full" onClick={run} disabled={submitting}>
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Generate {count > 1 ? `×${count}` : ""}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
