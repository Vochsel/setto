"use client";

import { ReactNode, useCallback, useEffect, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Loader2, RefreshCw, MapPin, X } from "lucide-react";
import {
  Map,
  AdvancedMarker,
  Pin,
  useMap,
  useMapsLibrary,
  type MapMouseEvent,
} from "@vis.gl/react-google-maps";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageUploader } from "@/components/image-uploader";
import {
  MapProvider,
  MapsUnavailable,
  MAPS_API_KEY,
  MAP_ID,
  useMapColorScheme,
} from "@/components/map/map-provider";
import { PlaceSearch, type PickedPlace } from "@/components/map/place-search";
import {
  cleanImageRefs,
  withDisplayUrls,
  type ImageRef,
} from "@/lib/types";
import type { Id } from "@/convex/_generated/dataModel";

interface LocationDoc {
  _id: string;
  name: string;
  description?: string;
  promptDescriptor?: string;
  address?: string;
  lat?: number;
  lng?: number;
  googlePlaceId?: string;
  images?: ImageRef[];
  imageUrls?: { url: string }[];
  streetViewRefs?: ImageRef[];
  streetViewUrls?: { url: string; caption?: string }[];
}

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

/** Map for re-picking an existing location's pin. Must render inside MapProvider. */
function LocationMap({
  place,
  onPick,
}: {
  place: PickedPlace | null;
  onPick: (p: PickedPlace) => void;
}) {
  const geocoding = useMapsLibrary("geocoding");

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
      onPick({ lat: ll.lat, lng: ll.lng, address });
    },
    [reverseGeocode, onPick],
  );

  const center = place ?? { lat: 48.8566, lng: 2.3522 };
  const colorScheme = useMapColorScheme();

  return (
    <div className="space-y-2">
      <PlaceSearch onSelect={onPick} placeholder="Search to move the pin…" />
      <div className="h-56 overflow-hidden rounded-lg border">
        <Map
          mapId={MAP_ID}
          className="h-full w-full"
          defaultCenter={center}
          defaultZoom={place ? 15 : 4}
          gestureHandling="greedy"
          disableDefaultUI
          colorScheme={colorScheme}
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
    </div>
  );
}

export function LocationEditor({
  trigger,
  location,
}: {
  trigger: ReactNode;
  location: LocationDoc;
}) {
  const update = useMutation(api.locations.update);
  const capture = useAction(api.streetview.capture);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const [name, setName] = useState(location.name);
  const [descriptor, setDescriptor] = useState(location.promptDescriptor ?? "");
  const [address, setAddress] = useState(location.address ?? "");
  const [images, setImages] = useState<ImageRef[]>(
    withDisplayUrls(location.images, location.imageUrls),
  );
  const [place, setPlace] = useState<PickedPlace | null>(
    location.lat != null && location.lng != null
      ? {
          lat: location.lat,
          lng: location.lng,
          address: location.address,
          placeId: location.googlePlaceId,
        }
      : null,
  );

  // Resolved Street View frames, aligned 1:1 with the raw refs so a delete can
  // remove the matching ref by index.
  const streetViewRefs = withDisplayUrls(
    location.streetViewRefs,
    location.streetViewUrls,
  );

  function handlePick(p: PickedPlace) {
    setPlace(p);
    if (p.address) setAddress(p.address);
  }

  /** Persist the editable fields without closing the sheet. */
  async function persist() {
    await update({
      id: location._id as Id<"locations">,
      name: name.trim() || location.name,
      promptDescriptor: descriptor.trim() || undefined,
      address: address.trim() || undefined,
      lat: place?.lat,
      lng: place?.lng,
      googlePlaceId: place?.placeId,
      images: cleanImageRefs(images),
    });
  }

  async function save() {
    setSaving(true);
    try {
      await persist();
      toast.success("Location updated");
      setOpen(false);
    } catch {
      toast.error("Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function recapture() {
    setCapturing(true);
    try {
      // Save first so Street View is captured at the (possibly moved) pin.
      await persist();
      const r = await capture({ locationId: location._id as Id<"locations"> });
      toast.success(
        r.added ? `Captured ${r.added} Street View frames` : "No new frames",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Capture failed");
    } finally {
      setCapturing(false);
    }
  }

  async function deleteStreetView(index: number) {
    const remaining = (location.streetViewRefs ?? []).filter(
      (_, i) => i !== index,
    );
    try {
      await update({
        id: location._id as Id<"locations">,
        streetViewRefs: cleanImageRefs(remaining),
      });
      toast.success("Street View reference removed");
    } catch {
      toast.error("Could not remove reference");
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>{location.name}</SheetTitle>
          <SheetDescription className="flex items-center gap-1">
            <MapPin className="h-3 w-3" /> {address || "No address"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 p-4">
          <div className="grid gap-2">
            <Label htmlFor="l-name">Name</Label>
            <Input
              id="l-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label>Location on map</Label>
            {MAPS_API_KEY ? (
              <MapProvider>
                <LocationMap place={place} onPick={handlePick} />
              </MapProvider>
            ) : (
              <MapsUnavailable compact />
            )}
            <p className="text-muted-foreground text-xs">
              Search or click the map to move the pin. Recapture pulls fresh
              Street View at the new spot.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="l-addr">Address</Label>
            <Input
              id="l-addr"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="l-desc">Prompt descriptor</Label>
            <Textarea
              id="l-desc"
              value={descriptor}
              onChange={(e) => setDescriptor(e.target.value)}
              placeholder="describe the look you want the backdrop to evoke…"
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>Street View references</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={recapture}
                disabled={capturing}
              >
                {capturing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Recapture
              </Button>
            </div>
            {streetViewRefs.length ? (
              <div className="grid grid-cols-4 gap-2">
                {streetViewRefs.map((s, i) => (
                  <div key={i} className="group/sv relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.url}
                      alt={s.caption ?? ""}
                      title={s.caption}
                      className="aspect-square w-full rounded-md object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => deleteStreetView(i)}
                      title="Remove"
                      className="bg-background/80 text-foreground hover:bg-destructive hover:text-destructive-foreground absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border opacity-0 shadow transition-opacity group-hover/sv:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-center text-xs">
                No Street View captured yet.
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Your reference images</Label>
            <ImageUploader value={images} onChange={setImages} />
          </div>
        </div>

        <SheetFooter className="border-t">
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
