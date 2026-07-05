"use client";

import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Compass, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  StreetViewRadiusControl,
  DEFAULT_STREETVIEW_RADIUS_M,
} from "@/components/streetview-radius-control";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * On-page "expand search radius + rescan" for a location. Reuses the same
 * `streetview.capture` engine and radius control as the shoot flow and the
 * location editor: toggling expansion samples random points within the radius
 * so the reference pool spans the surrounding area. Only meaningful when the
 * location has coordinates (Street View needs a lat/lng to snap to).
 */
export function LocationRescan({
  location,
}: {
  location: {
    _id: string;
    streetViewRadiusEnabled?: boolean;
    streetViewRadiusMeters?: number;
  };
}) {
  const update = useMutation(api.locations.update);
  const capture = useAction(api.streetview.capture);
  const [enabled, setEnabled] = useState(
    location.streetViewRadiusEnabled ?? false,
  );
  const [radius, setRadius] = useState(
    location.streetViewRadiusMeters ?? DEFAULT_STREETVIEW_RADIUS_M,
  );
  const [capturing, setCapturing] = useState(false);

  async function rescan() {
    setCapturing(true);
    try {
      // Persist the radius setting (so shoots reuse it) before capturing.
      await update({
        id: location._id as Id<"locations">,
        streetViewRadiusEnabled: enabled,
        streetViewRadiusMeters: radius,
      });
      const r = await capture({
        locationId: location._id as Id<"locations">,
        radiusMeters: enabled ? radius : 0,
      });
      toast.success(
        r.added
          ? `Captured ${r.added} Street View frame${r.added === 1 ? "" : "s"}`
          : "No new frames found",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Capture failed");
    } finally {
      setCapturing(false);
    }
  }

  return (
    <div className="space-y-2">
      <StreetViewRadiusControl
        enabled={enabled}
        radiusMeters={radius}
        onChange={(en, r) => {
          setEnabled(en);
          setRadius(r);
        }}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={rescan}
        disabled={capturing}
      >
        {capturing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Compass className="h-4 w-4" />
        )}
        {enabled ? `Rescan + nearby (${radius} m)` : "Rescan Street View"}
      </Button>
    </div>
  );
}
