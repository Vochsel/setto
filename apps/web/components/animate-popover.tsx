"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Film, Loader2 } from "lucide-react";
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
import { formatPrice } from "@/convex/lib/imageModels";
import {
  VIDEO_MODELS,
  DEFAULT_VIDEO_MODEL_ID,
  getVideoModel,
  estimateVideoCost,
  formatPricePerSecond,
} from "@/convex/lib/videoModels";
import type { Id } from "@/convex/_generated/dataModel";

/** Sensible starting motion prompt — natural, ambient movement. */
const DEFAULT_MOTION_PROMPT =
  "natural video footage of ambient life, keep subject in frame and same expression and pose";

/**
 * Popover to animate a finished image into a video: pick a fal i2v model, a
 * duration and a motion prompt. Shared by the shot card tiles and the
 * fullscreen lightbox — pass your own `trigger`.
 */
export function AnimatePopover({
  generationId,
  trigger,
  align = "start",
}: {
  generationId: Id<"generations">;
  trigger: React.ReactNode;
  align?: "start" | "center" | "end";
}) {
  const generateVideo = useMutation(api.videos.generate);
  const [open, setOpen] = useState(false);
  const [modelKey, setModelKey] = useState(DEFAULT_VIDEO_MODEL_ID);
  const [prompt, setPrompt] = useState(DEFAULT_MOTION_PROMPT);
  const [submitting, setSubmitting] = useState(false);

  const model = getVideoModel(modelKey) ?? VIDEO_MODELS[0];
  const [duration, setDuration] = useState<number>(model.defaultDuration);
  // Keep duration valid when the model changes.
  const effectiveDuration = model.durations.includes(duration)
    ? duration
    : model.defaultDuration;

  async function run() {
    if (!prompt.trim()) {
      toast.error("Describe the motion to animate");
      return;
    }
    setSubmitting(true);
    try {
      await generateVideo({
        generationId,
        modelKey,
        prompt: prompt.trim(),
        durationSeconds: effectiveDuration,
      });
      toast.success("Animating image…");
      setOpen(false);
      setPrompt(DEFAULT_MOTION_PROMPT);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start video");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-80 space-y-3" align={align}>
        <p className="text-xs font-medium">Animate into a video</p>

        <Select
          value={modelKey}
          onValueChange={(v) => {
            setModelKey(v);
            const m = getVideoModel(v);
            if (m) setDuration(m.defaultDuration);
          }}
        >
          <SelectTrigger size="sm" className="w-full min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VIDEO_MODELS.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                <span className="flex w-full items-center justify-between gap-3">
                  <span className="truncate">{m.label}</span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {formatPricePerSecond(m.pricePerSecond)}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Select
            value={String(effectiveDuration)}
            onValueChange={(v) => setDuration(Number(v))}
          >
            <SelectTrigger size="sm" className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {model.durations.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d}s
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground text-xs tabular-nums">
            Est. ~{formatPrice(estimateVideoCost(modelKey, effectiveDuration))}
          </span>
        </div>

        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the motion — e.g. slow push-in, hair moving in the wind, subtle smile…"
          className="min-h-[64px] text-sm"
        />

        <Button size="sm" className="w-full" onClick={run} disabled={submitting}>
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Film className="h-4 w-4" />
          )}
          Generate video
        </Button>
      </PopoverContent>
    </Popover>
  );
}
