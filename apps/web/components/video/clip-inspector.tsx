"use client";

import { useRef } from "react";
import { Sparkles } from "lucide-react";
import {
  kenBurnsControls,
  kenBurnsFromControls,
  type VideoClip,
  type VideoEffect,
  type VideoTransition,
  type TransitionType,
  type TemplateKind,
} from "@setto/core/video";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatSeconds } from "@/lib/video-format";

const TRANSITIONS: { value: TransitionType; label: string }[] = [
  { value: "none", label: "Cut (no transition)" },
  { value: "fade", label: "Fade through black" },
  { value: "dissolve", label: "Dissolve" },
  { value: "slide", label: "Slide" },
  { value: "wipe", label: "Wipe" },
];

/** A draggable focal-point pad overlaid on the clip thumbnail. */
function FocalPad({
  src,
  x,
  y,
  onChange,
}: {
  src?: string;
  x: number;
  y: number;
  onChange: (x: number, y: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  function update(clientX: number, clientY: number) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((clientY - rect.top) / rect.height) * 2 - 1;
    onChange(
      Math.max(-1, Math.min(1, nx)),
      Math.max(-1, Math.min(1, ny)),
    );
  }

  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (dragging.current) update(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        dragging.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      className="bg-muted relative mx-auto aspect-[9/16] w-full max-w-[132px] cursor-crosshair touch-none overflow-hidden rounded-lg border select-none"
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          draggable={false}
          className="pointer-events-none h-full w-full object-cover opacity-90"
        />
      ) : null}
      {/* Crosshair guides */}
      <span
        className="pointer-events-none absolute inset-y-0 w-px bg-white/40"
        style={{ left: `${((x + 1) / 2) * 100}%` }}
      />
      <span
        className="pointer-events-none absolute inset-x-0 h-px bg-white/40"
        style={{ top: `${((y + 1) / 2) * 100}%` }}
      />
      <span
        className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black/30 shadow ring-1 ring-black/40"
        style={{
          left: `${((x + 1) / 2) * 100}%`,
          top: `${((y + 1) / 2) * 100}%`,
        }}
      />
    </div>
  );
}

export function ClipInspector({
  clip,
  index,
  templateKind,
  onRetime,
  onSetTransition,
  onSetEffect,
}: {
  clip: VideoClip;
  index: number;
  templateKind: TemplateKind;
  onRetime: (ms: number) => void;
  onSetTransition: (t: VideoTransition) => void;
  onSetEffect: (e: VideoEffect) => void;
}) {
  const isImage = clip.sourceType === "image";
  const isSequence = templateKind === "sequence";
  const kb = kenBurnsControls(clip.effect);
  const kbOn = clip.effect?.type === "kenburns";
  const tr = clip.transition ?? { type: "none" as const, durationMs: 0 };

  function setControls(patch: Partial<typeof kb>) {
    onSetEffect(kenBurnsFromControls({ ...kb, ...patch }));
  }

  return (
    <div className="space-y-4 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Clip {index + 1}</span>
        <span className="text-muted-foreground text-xs capitalize">
          {clip.sourceType}
        </span>
      </div>

      {/* Duration */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <Label className="text-muted-foreground text-xs">Duration</Label>
          <span className="text-xs tabular-nums">
            {formatSeconds(clip.durationMs)}
          </span>
        </div>
        <Slider
          value={[clip.durationMs]}
          min={300}
          max={10000}
          step={100}
          onValueChange={([v]) => onRetime(v)}
          aria-label="Clip duration"
        />
      </div>

      {/* Transition (into this clip) */}
      {isSequence && index > 0 ? (
        <div className="space-y-2">
          <Label className="text-muted-foreground text-xs">Transition in</Label>
          <Select
            value={tr.type}
            onValueChange={(t) =>
              onSetTransition({
                type: t as TransitionType,
                durationMs: t === "none" ? 0 : tr.durationMs || 400,
              })
            }
          >
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRANSITIONS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {tr.type !== "none" ? (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-muted-foreground text-[11px]">Length</span>
                <span className="text-[11px] tabular-nums">
                  {(tr.durationMs / 1000).toFixed(2)}s
                </span>
              </div>
              <Slider
                value={[tr.durationMs]}
                min={150}
                max={2000}
                step={50}
                onValueChange={([v]) =>
                  onSetTransition({ type: tr.type, durationMs: v })
                }
                aria-label="Transition length"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Ken Burns (image + sequence only) */}
      {isImage && isSequence ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5 text-xs font-medium">
              <Sparkles className="h-3.5 w-3.5" /> Ken Burns
            </Label>
            <Switch
              checked={kbOn}
              onCheckedChange={(on) =>
                onSetEffect(
                  on
                    ? kenBurnsFromControls({ ...kb, direction: kb.direction })
                    : { type: "none" },
                )
              }
              aria-label="Toggle Ken Burns"
            />
          </div>

          {kbOn ? (
            <div className="space-y-3">
              <ToggleGroup
                type="single"
                value={kb.direction}
                onValueChange={(v) =>
                  v && setControls({ direction: v as "in" | "out" })
                }
                className="w-full"
              >
                <ToggleGroupItem value="in" className="flex-1 text-xs">
                  Zoom in
                </ToggleGroupItem>
                <ToggleGroupItem value="out" className="flex-1 text-xs">
                  Zoom out
                </ToggleGroupItem>
              </ToggleGroup>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-muted-foreground text-[11px]">Zoom</span>
                  <span className="text-[11px] tabular-nums">
                    {Math.round(kb.zoom * 100)}%
                  </span>
                </div>
                <Slider
                  value={[Math.round(kb.zoom * 100)]}
                  min={102}
                  max={160}
                  step={1}
                  onValueChange={([v]) => setControls({ zoom: v / 100 })}
                  aria-label="Ken Burns zoom"
                />
              </div>

              <div>
                <span className="text-muted-foreground mb-1.5 block text-[11px]">
                  Focal point{" "}
                  <span className="opacity-70">(drag where it {kb.direction === "in" ? "zooms to" : "starts"})</span>
                </span>
                <FocalPad
                  src={isImage ? clip.url : clip.posterUrl}
                  x={kb.focusX}
                  y={kb.focusY}
                  onChange={(x, y) => setControls({ focusX: x, focusY: y })}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {isImage && templateKind === "stack" ? (
        <p className="text-muted-foreground text-[11px]">
          Motion & transitions don’t apply in the Photo Stack template — tune the
          stack speed & background in the settings panel.
        </p>
      ) : null}
    </div>
  );
}
