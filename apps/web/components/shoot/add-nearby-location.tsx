"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import {
  Map,
  AdvancedMarker,
  Pin,
  useMap,
  useMapsLibrary,
  type MapMouseEvent,
} from "@vis.gl/react-google-maps";
import { Check, Loader2, MapPin, Navigation, Plus, Search } from "lucide-react";
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
import {
  MapProvider,
  MapsUnavailable,
  MAPS_API_KEY,
  MAP_ID,
  useMapColorScheme,
} from "@/components/map/map-provider";
import { PlaceSearch, type PickedPlace } from "@/components/map/place-search";
import { cn } from "@/lib/utils";
import type { Id } from "@/convex/_generated/dataModel";

type LatLng = { lat: number; lng: number };

interface NearbyPlace extends PickedPlace {
  /** Stable key for de-duping markers (place id, else rounded coords). */
  key: string;
}

const DEFAULT_CENTER: LatLng = { lat: 48.8566, lng: 2.3522 }; // Paris fallback
const SEARCH_RADIUS = 1200; // metres

function placeKey(p: { placeId?: string; lat: number; lng: number }) {
  return p.placeId ?? `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
}

/** Keeps the map centred on the active anchor without fighting user panning. */
function PanTo({ target }: { target: LatLng }) {
  const map = useMap();
  useEffect(() => {
    if (map) map.panTo(target);
  }, [map, target]);
  return null;
}

function NearbyInner({
  shootId,
  initialCenter,
  shootPlaceIds,
  onDone,
}: {
  shootId: Id<"shoots">;
  initialCenter?: LatLng;
  shootPlaceIds: string[];
  onDone: () => void;
}) {
  const map = useMap();
  const places = useMapsLibrary("places");
  const geocoding = useMapsLibrary("geocoding");
  const colorScheme = useMapColorScheme();

  const create = useMutation(api.locations.create);
  const addLoc = useMutation(api.shootLocations.add);
  const capture = useAction(api.streetview.capture);
  const allLocations = useQuery(api.locations.list, {});

  // A detached node is enough for PlacesService — we drive results ourselves.
  const placesSvc = useMemo(
    () =>
      places ? new places.PlacesService(document.createElement("div")) : null,
    [places],
  );
  const geocoder = useMemo(
    () => (geocoding ? new geocoding.Geocoder() : null),
    [geocoding],
  );

  const [anchor, setAnchor] = useState<LatLng>(initialCenter ?? DEFAULT_CENTER);
  const [nearby, setNearby] = useState<NearbyPlace[]>([]);
  const [selected, setSelected] = useState<PickedPlace | null>(null);
  const [name, setName] = useState("");
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  // Place ids already on the shoot (passed in) plus ones added this session.
  const [addedKeys, setAddedKeys] = useState<Set<string>>(
    () => new Set(shootPlaceIds),
  );

  // When the shoot has no located stops, fall back to the viewer's position.
  useEffect(() => {
    if (initialCenter || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setAnchor({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { timeout: 8000 },
    );
  }, [initialCenter]);

  const search = useCallback(
    (at: LatLng) => {
      if (!placesSvc) return;
      setSearching(true);
      placesSvc.nearbySearch(
        { location: at, radius: SEARCH_RADIUS },
        (results, status) => {
          setSearching(false);
          if (status !== google.maps.places.PlacesServiceStatus.OK || !results)
            return;
          setNearby(
            results
              .map((r) => {
                const loc = r.geometry?.location;
                if (!loc) return null;
                const p: NearbyPlace = {
                  lat: loc.lat(),
                  lng: loc.lng(),
                  name: r.name ?? undefined,
                  address: r.vicinity ?? undefined,
                  placeId: r.place_id ?? undefined,
                  key: placeKey({
                    placeId: r.place_id ?? undefined,
                    lat: loc.lat(),
                    lng: loc.lng(),
                  }),
                };
                return p;
              })
              .filter((p): p is NearbyPlace => p !== null)
              .slice(0, 24),
          );
        },
      );
    },
    [placesSvc],
  );

  // Run a fresh search whenever the anchor moves (initial, geolocation, search).
  // This synchronises the marker list with the Places API; the loading flag it
  // sets is the standard fetch pattern, not a cascading render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    search(anchor);
  }, [anchor, search]);

  const reverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      if (!geocoder) return undefined;
      try {
        const { results } = await geocoder.geocode({ location: { lat, lng } });
        return results[0]?.formatted_address;
      } catch {
        return undefined;
      }
    },
    [geocoder],
  );

  function pick(p: PickedPlace) {
    setSelected(p);
    setName(p.name || p.address || "");
  }

  const handleMapClick = useCallback(
    async (e: MapMouseEvent) => {
      const ll = e.detail.latLng;
      if (!ll) return;
      const placeId = e.detail.placeId ?? undefined;
      // A POI was tapped — stop the default info window and keep its id.
      e.stop?.();
      const address = await reverseGeocode(ll.lat, ll.lng);
      pick({ lat: ll.lat, lng: ll.lng, address, placeId });
    },
    [reverseGeocode],
  );

  function searchThisArea() {
    const c = map?.getCenter();
    if (c) setAnchor({ lat: c.lat(), lng: c.lng() });
  }

  async function add() {
    if (!selected) return;
    const finalName =
      name.trim() || selected.name?.trim() || selected.address?.trim() || "";
    if (!finalName) {
      toast.error("Give this place a name first");
      return;
    }
    setSaving(true);
    try {
      // Reuse an existing library location if this exact place was saved before,
      // so we don't create duplicate entries.
      const existing = selected.placeId
        ? allLocations?.find((l) => l.googlePlaceId === selected.placeId)
        : undefined;

      let locationId = existing?._id;
      let created = false;
      if (!locationId) {
        locationId = await create({
          name: finalName,
          address: selected.address,
          lat: selected.lat,
          lng: selected.lng,
          googlePlaceId: selected.placeId,
        });
        created = true;
      }

      await addLoc({ shootId, locationId });
      toast.success(`Added ${finalName}`);

      // Pull Street View references in the background for brand-new locations.
      if (created) {
        capture({ locationId })
          .then((r) => {
            if (r.added)
              toast.success(`Captured ${r.added} Street View frames`);
          })
          .catch(() => {});
      }

      setAddedKeys((prev) => new Set(prev).add(placeKey(selected)));
      setSelected(null);
      setName("");
    } catch {
      toast.error("Could not add location");
    } finally {
      setSaving(false);
    }
  }

  const selectedKey = selected ? placeKey(selected) : undefined;

  return (
    <div className="space-y-3">
      <PlaceSearch
        placeholder="Jump to an area…"
        onSelect={(p) => setAnchor({ lat: p.lat, lng: p.lng })}
      />

      <div className="relative h-72 overflow-hidden rounded-lg border">
        <Map
          mapId={MAP_ID}
          className="h-full w-full"
          defaultCenter={anchor}
          defaultZoom={15}
          gestureHandling="greedy"
          disableDefaultUI
          clickableIcons
          colorScheme={colorScheme}
          onClick={handleMapClick}
        >
          <PanTo target={anchor} />

          {nearby.map((p) => {
            const added = addedKeys.has(p.key);
            const active = p.key === selectedKey;
            return (
              <AdvancedMarker
                key={p.key}
                position={{ lat: p.lat, lng: p.lng }}
                onClick={() => pick(p)}
                zIndex={active ? 10 : 1}
              >
                <button
                  type="button"
                  className={cn(
                    "flex max-w-40 -translate-y-1 items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium shadow-md backdrop-blur transition-all",
                    active
                      ? "bg-primary text-primary-foreground border-primary scale-105"
                      : added
                        ? "bg-muted text-muted-foreground border-border"
                        : "bg-card/90 text-foreground border-border hover:scale-105",
                  )}
                >
                  {added ? (
                    <Check className="h-3 w-3 shrink-0" />
                  ) : (
                    <MapPin className="h-3 w-3 shrink-0 opacity-70" />
                  )}
                  <span className="truncate">{p.name ?? "Place"}</span>
                </button>
              </AdvancedMarker>
            );
          })}

          {/* A point picked off-grid (map click / POI) that isn't a result pill. */}
          {selected && !nearby.some((p) => p.key === selectedKey) && (
            <AdvancedMarker
              position={{ lat: selected.lat, lng: selected.lng }}
              zIndex={20}
            >
              <Pin
                background="#8b5cf6"
                borderColor="#5b21b6"
                glyphColor="#1e1b4b"
              />
            </AdvancedMarker>
          )}
        </Map>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={searchThisArea}
          disabled={searching}
          className="absolute top-2 left-1/2 -translate-x-1/2 shadow-md"
        >
          {searching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Search this area
        </Button>
      </div>

      {selected ? (
        <div className="grid gap-2 rounded-lg border p-3">
          <Label htmlFor="nearby-name">Name</Label>
          <Input
            id="nearby-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name this place"
          />
          {selected.address ? (
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{selected.address}</span>
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelected(null)}
            >
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={add} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add to shoot
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3" />
            Tap a nearby place — or click anywhere on the map.
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Done
          </Button>
        </p>
      )}
    </div>
  );
}

/**
 * Quick "add a nearby place" flow for the shoot page: browse real places around
 * the shoot's area on a map and add one in a tap.
 */
export function AddNearbyLocation({
  shootId,
  center,
  shootPlaceIds,
}: {
  shootId: Id<"shoots">;
  /** Seed the map near the shoot's existing stops, if any. */
  center?: LatLng;
  /** Google place ids already on this shoot (to flag them as added). */
  shootPlaceIds: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Navigation className="h-4 w-4" /> Add nearby
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a nearby location</DialogTitle>
          <DialogDescription>
            Browse real places around the shoot and add them in a tap.
          </DialogDescription>
        </DialogHeader>
        {MAPS_API_KEY ? (
          <MapProvider>
            <NearbyInner
              shootId={shootId}
              initialCenter={center}
              shootPlaceIds={shootPlaceIds}
              onDone={() => setOpen(false)}
            />
          </MapProvider>
        ) : (
          <MapsUnavailable />
        )}
      </DialogContent>
    </Dialog>
  );
}
