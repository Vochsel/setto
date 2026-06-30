"use client";

import { Compass } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

/** Default radius (metres) shown when expansion is first switched on. */
export const DEFAULT_STREETVIEW_RADIUS_M = 150;
export const STREETVIEW_RADIUS_MIN = 50;
export const STREETVIEW_RADIUS_MAX = 500;
const STEP = 25;

/**
 * Toggle + radius control for Street View "nearby" expansion. When on, a
 * capture also samples random points within `radiusMeters` of the pin so the
 * backdrop reference pool spans the surrounding area. Stateless — the parent
 * owns the values and persists `onChange`.
 */
export function StreetViewRadiusControl({
  enabled,
  radiusMeters,
  onChange,
  className,
  title = "Expand Street View radius",
  description = "Also pull frames from random nearby spots — varies the backdrop with real surroundings.",
}: {
  enabled: boolean;
  radiusMeters: number;
  onChange: (enabled: boolean, radiusMeters: number) => void;
  className?: string;
  title?: string;
  description?: string;
}) {
  const radius = radiusMeters || DEFAULT_STREETVIEW_RADIUS_M;
  return (
    <div className={cn("rounded-lg border p-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <Label className="flex items-center gap-1.5 text-sm font-medium">
            <Compass className="h-3.5 w-3.5" /> {title}
          </Label>
          <p className="text-muted-foreground text-xs">{description}</p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(c) => onChange(c, radius)}
          aria-label={title}
        />
      </div>
      {enabled && (
        <div className="mt-3 flex items-center gap-3">
          <Slider
            min={STREETVIEW_RADIUS_MIN}
            max={STREETVIEW_RADIUS_MAX}
            step={STEP}
            value={[radius]}
            onValueChange={([v]) => onChange(true, v)}
            className="flex-1"
          />
          <span className="text-muted-foreground w-16 shrink-0 text-right text-xs tabular-nums">
            {radius} m
          </span>
        </div>
      )}
    </div>
  );
}
