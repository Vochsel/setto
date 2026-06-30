"use client";

import { useEffect } from "react";
import { Map, AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { MapPin } from "lucide-react";
import {
  MapProvider,
  MapsUnavailable,
  MAP_ID,
  MAPS_API_KEY,
  useMapColorScheme,
} from "@/components/map/map-provider";
import { cn } from "@/lib/utils";
import type { ShootLocationDoc } from "@/components/shoot/types";

function FitBounds({ points }: { points: { lat: number; lng: number }[] }) {
  const map = useMap();
  const key = points.map((p) => `${p.lat},${p.lng}`).join("|");
  useEffect(() => {
    if (!map || points.length === 0) return;
    if (points.length === 1) {
      map.setCenter(points[0]);
      map.setZoom(14);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 64);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

function MapInner({
  shootLocations,
  selectedId,
  onSelect,
  shotCounts,
}: {
  shootLocations: ShootLocationDoc[];
  selectedId?: string;
  onSelect: (id: string) => void;
  shotCounts: Record<string, number>;
}) {
  const located = shootLocations.filter(
    (sl) => sl.location?.lat != null && sl.location?.lng != null,
  );
  const points = located.map((sl) => ({
    lat: sl.location!.lat!,
    lng: sl.location!.lng!,
  }));
  const colorScheme = useMapColorScheme();

  return (
    <Map
      mapId={MAP_ID}
      defaultCenter={points[0] ?? { lat: 30, lng: 0 }}
      defaultZoom={points.length ? 12 : 2}
      gestureHandling="greedy"
      disableDefaultUI
      colorScheme={colorScheme}
      className="h-full w-full"
    >
      <FitBounds points={points} />
      {located.map((sl, i) => {
        const active = sl._id === selectedId;
        return (
          <AdvancedMarker
            key={sl._id}
            position={{ lat: sl.location!.lat!, lng: sl.location!.lng! }}
            onClick={() => onSelect(sl._id)}
            zIndex={active ? 10 : 1}
          >
            <button
              className={cn(
                "flex -translate-y-1 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shadow-lg backdrop-blur transition-all",
                active
                  ? "bg-primary text-primary-foreground border-primary scale-105"
                  : "bg-card/90 text-foreground border-border hover:scale-105",
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-full text-[10px]",
                  active ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground",
                )}
              >
                {i + 1}
              </span>
              <span className="max-w-32 truncate">{sl.location!.name}</span>
              <span className="opacity-70">· {shotCounts[sl._id] ?? 0}</span>
            </button>
          </AdvancedMarker>
        );
      })}
    </Map>
  );
}

export function ShootMap(props: {
  shootLocations: ShootLocationDoc[];
  selectedId?: string;
  onSelect: (id: string) => void;
  shotCounts: Record<string, number>;
}) {
  if (!MAPS_API_KEY) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <MapsUnavailable />
      </div>
    );
  }
  const hasCoords = props.shootLocations.some(
    (sl) => sl.location?.lat != null,
  );
  return (
    <MapProvider>
      {hasCoords ? (
        <MapInner {...props} />
      ) : (
        <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-center text-sm">
          <MapPin className="h-6 w-6" />
          <p>Add a location with coordinates to see it on the map.</p>
        </div>
      )}
    </MapProvider>
  );
}
