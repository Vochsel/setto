"use client";

import { Compass } from "lucide-react";
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
 *
 * Uses a plain button + native range input (not the radix Switch/Slider) so it
 * stays reliably interactive.
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
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Compass className="h-3.5 w-3.5" /> {title}
          </div>
          <p className="text-muted-foreground text-xs">{description}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={title}
          onClick={() => onChange(!enabled, radius)}
          className={cn(
            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            enabled ? "bg-primary" : "bg-input dark:bg-input/80",
          )}
        >
          <span
            className={cn(
              "inline-block size-4 rounded-full bg-background shadow-sm transition-transform",
              enabled ? "translate-x-[18px]" : "translate-x-0.5",
            )}
          />
        </button>
      </div>
      {enabled && (
        <div className="mt-3 flex items-center gap-3">
          <input
            type="range"
            min={STREETVIEW_RADIUS_MIN}
            max={STREETVIEW_RADIUS_MAX}
            step={STEP}
            value={radius}
            onChange={(e) => onChange(true, Number(e.target.value))}
            aria-label="Street View radius (metres)"
            className="accent-primary h-1.5 flex-1 cursor-pointer"
          />
          <span className="text-muted-foreground w-16 shrink-0 text-right text-xs tabular-nums">
            {radius} m
          </span>
        </div>
      )}
    </div>
  );
}
