"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { format } from "date-fns";
import { toast } from "sonner";
import { Settings2, MapPin, Loader2, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ConfirmDelete } from "@/components/confirm-delete";
import { EmptyState } from "@/components/empty-state";
import { ShootMap } from "@/components/shoot/shoot-map";
import { AddLocation } from "@/components/shoot/add-location";
import { LocationPanel } from "@/components/shoot/location-panel";
import { ShootGallery } from "@/components/shoot/shoot-gallery";
import { formatDateTime, shootStatusMeta, type ShootStatus } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Id } from "@/convex/_generated/dataModel";
import type {
  LibraryData,
  ShootLocationDoc,
  ShotDoc,
} from "@/components/shoot/types";

const STATUSES: ShootStatus[] = ["draft", "active", "completed", "archived"];

export default function ShootEditorPage() {
  const params = useParams<{ id: string }>();
  const shootId = params.id as Id<"shoots">;
  const router = useRouter();

  const shoot = useQuery(api.shoots.get, { id: shootId });
  const shootLocations = useQuery(api.shootLocations.listByShoot, { shootId });
  const shots = useQuery(api.shots.listByShoot, { shootId });
  const models = useQuery(api.models.list, {});
  const outfits = useQuery(api.outfits.list, {});
  const styles = useQuery(api.presets.list, { type: "photography_style" });
  const cameras = useQuery(api.presets.list, { type: "camera_setup" });
  const lightings = useQuery(api.presets.list, { type: "lighting" });

  const updateShoot = useMutation(api.shoots.update);
  const removeShoot = useMutation(api.shoots.remove);

  const [selectedLocIdRaw, setSelectedLocId] = useState<string | undefined>();
  // Derive the effective selection during render: fall back to the first
  // location when nothing is picked or the picked one no longer exists.
  const selectedLocId =
    selectedLocIdRaw &&
    shootLocations?.some((l) => l._id === selectedLocIdRaw)
      ? selectedLocIdRaw
      : shootLocations?.[0]?._id;

  const library: LibraryData = useMemo(
    () => ({
      models: (models ?? []).map((m) => ({
        _id: m._id,
        name: m.name,
        promptDescriptor: m.promptDescriptor,
        attributes: m.attributes,
        imageUrls: m.imageUrls,
      })),
      outfits: (outfits ?? []).map((o) => ({
        _id: o._id,
        name: o.name,
        promptDescriptor: o.promptDescriptor,
        variations: o.variations,
      })),
      styles: (styles ?? []).map((p) => ({
        _id: p._id,
        name: p.name,
        promptDescriptor: p.promptDescriptor,
      })),
      cameras: (cameras ?? []).map((p) => ({
        _id: p._id,
        name: p.name,
        promptDescriptor: p.promptDescriptor,
      })),
      lightings: (lightings ?? []).map((p) => ({
        _id: p._id,
        name: p.name,
        promptDescriptor: p.promptDescriptor,
      })),
    }),
    [models, outfits, styles, cameras, lightings],
  );

  const shotsByLocation = useMemo(() => {
    const map: Record<string, ShotDoc[]> = {};
    for (const s of (shots ?? []) as unknown as ShotDoc[]) {
      (map[s.shootLocationId] ??= []).push(s);
    }
    return map;
  }, [shots]);

  // Count of succeeded images across the shoot (for the Gallery tab badge).
  const photoCount = useMemo(
    () =>
      ((shots ?? []) as unknown as ShotDoc[]).reduce(
        (n, s) =>
          n +
          s.generations.filter(
            (g) => g.status === "succeeded" && g.imageUrl,
          ).length,
        0,
      ),
    [shots],
  );

  if (shoot === undefined) {
    return (
      <>
        <PageHeader title={<Skeleton className="h-5 w-40" />} />
        <div className="p-6">
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      </>
    );
  }
  if (shoot === null) {
    return (
      <>
        <PageHeader title="Shoot not found" />
        <div className="p-6">
          <Button onClick={() => router.push("/shoots")}>Back to shoots</Button>
        </div>
      </>
    );
  }

  const locs = (shootLocations ?? []) as unknown as ShootLocationDoc[];
  const selected = locs.find((l) => l._id === selectedLocId);
  const shotCounts: Record<string, number> = Object.fromEntries(
    locs.map((l) => [l._id, shotsByLocation[l._id]?.length ?? 0]),
  );
  const status = shootStatusMeta[shoot.status];

  return (
    <>
      <PageHeader title={shoot.name} description={formatDateTime(shoot.scheduledAt)}>
        <Select
          value={shoot.status}
          onValueChange={(v) =>
            updateShoot({ id: shootId, status: v as ShootStatus })
          }
        >
          <SelectTrigger size="sm" className={cn("w-32", status.className)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {shootStatusMeta[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ShootSettings
          shoot={shoot}
          onSave={(patch) => updateShoot({ id: shootId, ...patch })}
          onDelete={async () => {
            await removeShoot({ id: shootId });
            toast.success("Shoot deleted");
            router.push("/shoots");
          }}
        />
      </PageHeader>

      <Tabs defaultValue="plan" className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="px-4 pt-3 md:px-6">
          <TabsList>
            <TabsTrigger value="plan">Plan</TabsTrigger>
            <TabsTrigger value="gallery">
              Gallery
              {photoCount > 0 && (
                <span className="text-muted-foreground ml-1 tabular-nums">
                  {photoCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="plan"
          className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 md:p-6 lg:grid-cols-[360px_1fr]"
        >
          {/* Left: map + locations */}
          <div className="space-y-3">
          <Card className="h-72 overflow-hidden p-0">
            <ShootMap
              shootLocations={locs}
              selectedId={selectedLocId}
              onSelect={setSelectedLocId}
              shotCounts={shotCounts}
            />
          </Card>

          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">
              Locations{" "}
              <span className="text-muted-foreground">({locs.length})</span>
            </h2>
            <AddLocation
              shootId={shootId}
              existingLocationIds={locs.map((l) => l.locationId)}
            />
          </div>

          <div className="space-y-2">
            {locs.map((l, i) => (
              <button
                key={l._id}
                onClick={() => setSelectedLocId(l._id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors",
                  l._id === selectedLocId
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <span className="bg-primary text-primary-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {l.location?.name ?? "Location"}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {shotCounts[l._id] ?? 0} shots ·{" "}
                    {l.modelIds?.length ?? 0} models
                  </span>
                </span>
              </button>
            ))}
            {locs.length === 0 && shootLocations !== undefined && (
              <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-xs">
                No locations yet. Add one to begin.
              </p>
            )}
          </div>
        </div>

        {/* Right: selected location */}
        <div className="min-w-0">
          {selected ? (
            <LocationPanel
              key={selected._id}
              shootLocation={selected}
              shots={shotsByLocation[selected._id] ?? []}
              library={library}
              scheduledAt={shoot.scheduledAt}
              onRemoved={() => setSelectedLocId(undefined)}
            />
          ) : (
            <EmptyState
              icon={MapPin}
              title="Pick a location"
              description="Add a location and select it to place models and build shots."
            />
          )}
          </div>
        </TabsContent>

        <TabsContent
          value="gallery"
          className="min-h-0 flex-1 overflow-auto p-4 md:p-6"
        >
          <ShootGallery shootId={shootId} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function ShootSettings({
  shoot,
  onSave,
  onDelete,
}: {
  shoot: {
    name: string;
    description?: string;
    scheduledAt?: number;
  };
  onSave: (patch: {
    name?: string;
    description?: string;
    scheduledAt?: number;
  }) => Promise<unknown>;
  onDelete: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(shoot.name);
  const [description, setDescription] = useState(shoot.description ?? "");
  const [when, setWhen] = useState(
    shoot.scheduledAt
      ? format(new Date(shoot.scheduledAt), "yyyy-MM-dd'T'HH:mm")
      : "",
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await onSave({
        name: name.trim() || shoot.name,
        description: description.trim() || undefined,
        scheduledAt: when ? new Date(when).getTime() : undefined,
      });
      toast.success("Shoot updated");
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="h-4 w-4" /> Settings
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Shoot settings</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="s-name">Name</Label>
            <Input
              id="s-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="s-when">Date &amp; time</Label>
            <Input
              id="s-when"
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="s-desc">Description</Label>
            <Textarea
              id="s-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          <ConfirmDelete
            title="Delete this shoot?"
            description="All its locations, shots and generations will be permanently removed."
            onConfirm={onDelete}
            trigger={
              <Button variant="ghost" className="text-destructive">
                <Trash2 className="h-4 w-4" /> Delete shoot
              </Button>
            }
          />
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
