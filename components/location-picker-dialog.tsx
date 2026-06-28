"use client";

import { ReactNode, useCallback, useEffect, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import {
  Map,
  AdvancedMarker,
  Pin,
  useMap,
  useMapsLibrary,
  ColorScheme,
  type MapMouseEvent,
} from "@vis.gl/react-google-maps";
import { Loader2, MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MapProvider,
  MapsUnavailable,
  MAPS_API_KEY,
  MAP_ID,
} from "@/components/map/map-provider";
import { PlaceSearch, type PickedPlace } from "@/components/map/place-search";

function PanTo({ target }: { target: PickedPlace | null }) {
  const map = useMap();
  useEffect(() => {
    if (map && target) {
      map.panTo({ lat: target.lat, lng: target.lng });
      map.setZoom(15);
    }
  }, [map, target]);
  return null;
}

function PickerInner({ onDone }: { onDone: (id?: string) => void }) {
  const create = useMutation(api.locations.create);
  const capture = useAction(api.streetview.capture);
  const geocoding = useMapsLibrary("geocoding");

  const [place, setPlace] = useState<PickedPlace | null>(null);
  const [name, setName] = useState("");
  const [descriptor, setDescriptor] = useState("");
  const [saving, setSaving] = useState(false);

  const reverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      if (!geocoding) return undefined;
      try {
        const geocoder = new geocoding.Geocoder();
        const { results } = await geocoder.geocode({ location: { lat, lng } });
        return results[0]?.formatted_address;
      } catch {
        return undefined;
      }
    },
    [geocoding],
  );

  const handleMapClick = useCallback(
    async (e: MapMouseEvent) => {
      const ll = e.detail.latLng;
      if (!ll) return;
      const address = await reverseGeocode(ll.lat, ll.lng);
      setPlace({ lat: ll.lat, lng: ll.lng, address });
    },
    [reverseGeocode],
  );

  function handlePlace(p: PickedPlace) {
    setPlace(p);
    setName((n) => n || p.name || "");
  }

  async function save() {
    if (!name.trim()) {
      toast.error("Give the location a name");
      return;
    }
    setSaving(true);
    try {
      const id = await create({
        name: name.trim(),
        address: place?.address,
        lat: place?.lat,
        lng: place?.lng,
        googlePlaceId: place?.placeId,
        promptDescriptor: descriptor.trim() || undefined,
      });
      toast.success("Location saved");
      if (place?.lat != null) {
        capture({ locationId: id })
          .then((r) => {
            if (r.added) toast.success(`Captured ${r.added} Street View frames`);
          })
          .catch(() => {});
      }
      onDone(id);
    } catch {
      toast.error("Could not save location");
    } finally {
      setSaving(false);
    }
  }

  const center = place
    ? { lat: place.lat, lng: place.lng }
    : { lat: 48.8566, lng: 2.3522 };

  return (
    <div className="space-y-3">
      <PlaceSearch onSelect={handlePlace} />
      <div className="h-64 overflow-hidden rounded-lg border">
        <Map
          mapId={MAP_ID}
          className="h-full w-full"
          defaultCenter={center}
          defaultZoom={place ? 15 : 4}
          gestureHandling="greedy"
          disableDefaultUI
          colorScheme={ColorScheme.DARK}
          onClick={handleMapClick}
        >
          <PanTo target={place} />
          {place && (
            <AdvancedMarker position={{ lat: place.lat, lng: place.lng }}>
              <Pin
                background="#8b5cf6"
                borderColor="#5b21b6"
                glyphColor="#1e1b4b"
              />
            </AdvancedMarker>
          )}
        </Map>
      </div>
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <MapPin className="h-3 w-3" />
        {place?.address ?? "Search or click the map to drop a pin"}
      </p>

      <div className="grid gap-2">
        <Label htmlFor="loc-name">Name</Label>
        <Input
          id="loc-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Rooftop — Alfama"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="loc-desc">Prompt descriptor</Label>
        <Textarea
          id="loc-desc"
          value={descriptor}
          onChange={(e) => setDescriptor(e.target.value)}
          placeholder="a sun-bleached terracotta rooftop overlooking the old town…"
        />
      </div>
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save location
        </Button>
      </div>
    </div>
  );
}

export function LocationPickerDialog({
  trigger,
  onCreated,
}: {
  trigger: ReactNode;
  onCreated?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New location</DialogTitle>
          <DialogDescription>
            Pick a real place — we’ll pull Street View references to ground the
            backdrop.
          </DialogDescription>
        </DialogHeader>
        {MAPS_API_KEY ? (
          <MapProvider>
            <PickerInner
              onDone={(id) => {
                setOpen(false);
                if (id) onCreated?.(id);
              }}
            />
          </MapProvider>
        ) : (
          <MapsUnavailable />
        )}
      </DialogContent>
    </Dialog>
  );
}
