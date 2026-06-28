"use client";

import { ReactNode } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";
import { MapPinOff } from "lucide-react";

export const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
// "DEMO_MAP_ID" is Google's public dev map id — enables Advanced Markers
// without provisioning a styled map. Replace with your own for production.
export const MAP_ID =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";

export function MapsUnavailable({ compact }: { compact?: boolean }) {
  return (
    <div
      className={`bg-muted/40 text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm ${
        compact ? "" : "min-h-[300px]"
      }`}
    >
      <MapPinOff className="h-6 w-6" />
      <p>
        Set{" "}
        <code className="bg-muted rounded px-1 py-0.5 text-xs">
          NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
        </code>{" "}
        to enable the map.
      </p>
    </div>
  );
}

/** Wrap any map UI. Renders a friendly notice when no API key is configured. */
export function MapProvider({ children }: { children: ReactNode }) {
  if (!MAPS_API_KEY) return <MapsUnavailable />;
  return <APIProvider apiKey={MAPS_API_KEY}>{children}</APIProvider>;
}
