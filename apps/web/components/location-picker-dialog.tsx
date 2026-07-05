"use client";

import { ReactNode, useCallback, useEffect, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
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
import { Loader2, MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ImageUploader } from "@/components/image-uploader";
import {
  MapProvider,
  MapsUnavailable,
  MAPS_API_KEY,
  MAP_ID,
  useMapColorScheme,
} from "@/components/map/map-provider";
import { PlaceSearch, type PickedPlace } from "@/components/map/place-search";
import { cleanImageRefs, type ImageRef } from "@/lib/types";
import { convexErrorMessage } from "@/lib/utils";

/** Called when a location has been created; `navigate` opens its detail page. */
type Finish = (id?: string, navigate?: boolean) => void;

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

/** Map tab — pin a real place; Street View is captured server-side. */
function MapInner({ onDone }: { onDone: Finish }) {
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
      if (address) setName((n) => n || address);
    },
    [reverseGeocode],
  );

  function handlePlace(p: PickedPlace) {
    setPlace(p);
    setName((n) => n || p.name || p.address || "");
  }

  async function save() {
    const finalName =
      name.trim() || place?.name?.trim() || place?.address?.trim() || "";
    if (!finalName) {
      toast.error("Pick a place on the map, or give the location a name");
      return;
    }
    setSaving(true);
    try {
      const id = await create({
        name: finalName,
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
  const colorScheme = useMapColorScheme();

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

/** Prompt tab — name it, describe the scene, and generate backdrops async. The
 * location is created immediately and you pick candidates on its page. */
function PromptInner({ onDone }: { onDone: Finish }) {
  const create = useMutation(api.locations.create);
  const generate = useAction(api.generate.generateBackdrops);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [interior, setInterior] = useState(true);
  const [creating, setCreating] = useState(false);

  async function go() {
    const finalName =
      name.trim() ||
      description.trim().split(/[.,\n]/)[0]?.trim().slice(0, 60) ||
      "";
    if (!finalName) {
      toast.error("Give the location a name");
      return;
    }
    setCreating(true);
    try {
      const id = await create({
        name: finalName,
        promptDescriptor: description.trim() || undefined,
      });
      await generate({
        locationId: id,
        description: description.trim() || undefined,
        interior,
        count: 4,
      });
      toast.success("Generating backdrops…");
      onDone(id, true);
    } catch (e) {
      toast.error(convexErrorMessage(e, "Could not start generation"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2">
        <Label htmlFor="pl-name">Name</Label>
        <Input
          id="pl-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Scandi living room"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="pl-desc">Describe the scene</Label>
        <Textarea
          id="pl-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="a sunlit Scandinavian living room with oak floors, a linen sofa and tall windows…"
          rows={4}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={interior} onCheckedChange={setInterior} />
        Interior scene
      </label>
      <p className="text-muted-foreground text-xs">
        We&apos;ll generate 4 candidates you can pick from — and you can keep
        generating more on the location&apos;s page.
      </p>
      <div className="flex justify-end">
        <Button onClick={go} disabled={creating}>
          {creating && <Loader2 className="h-4 w-4 animate-spin" />}
          Generate backdrops
        </Button>
      </div>
    </div>
  );
}

/** Upload tab — create a location straight from your own (interior) photos. */
function UploadInner({ onDone }: { onDone: Finish }) {
  const create = useMutation(api.locations.create);
  const [name, setName] = useState("");
  const [descriptor, setDescriptor] = useState("");
  const [images, setImages] = useState<ImageRef[]>([]);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      toast.error("Give the location a name");
      return;
    }
    if (!images.length) {
      toast.error("Add at least one photo");
      return;
    }
    setSaving(true);
    try {
      const id = await create({
        name: name.trim(),
        promptDescriptor: descriptor.trim() || undefined,
        images: cleanImageRefs(images),
      });
      toast.success("Location saved");
      onDone(id);
    } catch {
      toast.error("Could not save location");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2">
        <Label htmlFor="ul-name">Name</Label>
        <Input
          id="ul-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Studio loft"
        />
      </div>
      <div className="grid gap-2">
        <Label>Photos</Label>
        <ImageUploader value={images} onChange={setImages} />
        <p className="text-muted-foreground text-xs">
          Upload interior shots (or paste them). These ground the backdrop when
          you generate shots here.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="ul-desc">Prompt descriptor</Label>
        <Textarea
          id="ul-desc"
          value={descriptor}
          onChange={(e) => setDescriptor(e.target.value)}
          placeholder="a warm concrete loft with big industrial windows…"
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
  const router = useRouter();

  const finish: Finish = (id, navigate) => {
    setOpen(false);
    if (id) {
      onCreated?.(id);
      if (navigate) router.push(`/locations/${id}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New location</DialogTitle>
          <DialogDescription>
            Pin a real place, prompt an interior scene, or upload your own
            photos.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="map">
          <TabsList className="w-full">
            <TabsTrigger value="map">Map</TabsTrigger>
            <TabsTrigger value="prompt">Prompt</TabsTrigger>
            <TabsTrigger value="upload">Upload</TabsTrigger>
          </TabsList>

          <TabsContent value="map" className="mt-4">
            {MAPS_API_KEY ? (
              <MapProvider>
                <MapInner onDone={finish} />
              </MapProvider>
            ) : (
              <MapsUnavailable />
            )}
          </TabsContent>

          <TabsContent value="prompt" className="mt-4">
            <PromptInner onDone={finish} />
          </TabsContent>

          <TabsContent value="upload" className="mt-4">
            <UploadInner onDone={finish} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
