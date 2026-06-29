"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Plus, MapPin, Box, Trash2, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDelete } from "@/components/confirm-delete";
import { EmptyState } from "@/components/empty-state";
import { ModelMultiSelect } from "@/components/shoot/model-multiselect";
import { ShotCard } from "@/components/shoot/shot-card";
import { AddLocationPhoto } from "@/components/shoot/add-location-photo";
import { ImageLightbox } from "@/components/image-lightbox";
import { StagingDialog } from "@/components/shoot/staging/staging-dialog";
import type { StageState } from "@/components/shoot/staging/types";
import type {
  ShootLocationDoc,
  ShotDoc,
  LibraryData,
} from "@/components/shoot/types";
import type { Id } from "@/convex/_generated/dataModel";

export function LocationPanel({
  shootLocation,
  shots,
  library,
  scheduledAt,
  onRemoved,
  highlightShotId,
}: {
  shootLocation: ShootLocationDoc;
  shots: ShotDoc[];
  library: LibraryData;
  scheduledAt?: number;
  onRemoved: () => void;
  /** Deep-link target shot to scroll to / highlight. */
  highlightShotId?: string;
}) {
  const setModels = useMutation(api.shootLocations.setModels);
  const removeLoc = useMutation(api.shootLocations.remove);
  const createShot = useMutation(api.shots.create);

  const loc = shootLocation.location;
  const presentModels =
    shootLocation.models.length > 0 ? shootLocation.models : library.models;

  // Reference imagery for this location: the user's own photos first (captured
  // on the day), then any Street View frames. Tap any to view full-screen.
  const references: { url: string; caption?: string; source: string }[] = [
    ...(loc?.imageUrls ?? []).map((r) => ({ url: r.url, source: "yours" })),
    ...(loc?.streetViewUrls ?? []).map((r) => ({
      url: r.url,
      caption: r.caption,
      source: "street_view",
    })),
  ];
  const [refIndex, setRefIndex] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      <Card className="gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              {loc?.name ?? "Location"}
            </h2>
            {loc?.address && (
              <p className="text-muted-foreground flex items-center gap-1 text-xs">
                <MapPin className="h-3 w-3" /> {loc.address}
              </p>
            )}
          </div>
          <ConfirmDelete
            title="Remove this location from the shoot?"
            description="Its shots will be removed too. The saved location stays in your library."
            onConfirm={async () => {
              await removeLoc({ id: shootLocation._id });
              toast.success("Location removed");
              onRemoved();
            }}
            trigger={
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive size-8 shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            }
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs font-medium">
              References{" "}
              {references.length > 0 ? `(${references.length})` : ""}
            </span>
            {loc?._id ? <AddLocationPhoto locationId={loc._id} /> : null}
          </div>
          {references.length ? (
            <div className="scrollbar-thin -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
              {references.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setRefIndex(i)}
                  title={s.caption}
                  className="group/ref relative h-28 w-40 shrink-0 cursor-zoom-in snap-start overflow-hidden rounded-md border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.url}
                    alt={s.caption ?? ""}
                    className="h-full w-full object-cover transition-transform group-hover/ref:scale-105"
                  />
                  {s.source === "yours" ? (
                    <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                      Yours
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground bg-muted/40 rounded-md p-2 text-xs">
              No references yet — take a photo on location, upload from your
              camera roll, or capture Street View from the Locations library.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ModelMultiSelect
            models={library.models}
            selected={shootLocation.modelIds ?? []}
            onChange={(ids) =>
              setModels({
                id: shootLocation._id,
                modelIds: ids as Id<"models">[],
              })
            }
          />
          <StagingDialog
            shootLocationId={shootLocation._id}
            initialStaging={(shootLocation.staging as StageState) ?? null}
            models={presentModels.map((m) => ({ _id: m._id, name: m.name }))}
            shotIds={shots.map((s) => s._id)}
            trigger={
              <Button variant="outline" size="sm">
                <Box className="h-4 w-4" /> Stage in 3D
              </Button>
            }
          />
          <Button
            size="sm"
            className="ml-auto"
            onClick={async () => {
              await createShot({ shootLocationId: shootLocation._id });
            }}
          >
            <Plus className="h-4 w-4" /> Add shot
          </Button>
        </div>
      </Card>

      {shots.length === 0 ? (
        <EmptyState
          icon={Camera}
          title="No shots at this location"
          description="A shot pairs a model with a wardrobe item, pose and camera — then generates imagery."
          action={
            <Button
              onClick={async () => {
                await createShot({ shootLocationId: shootLocation._id });
              }}
            >
              <Plus className="h-4 w-4" /> Add shot
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {shots.map((shot) => (
            <ShotCard
              key={shot._id}
              shot={shot}
              library={library}
              location={{
                name: loc?.name,
                address: loc?.address,
                promptDescriptor: loc?.promptDescriptor,
                streetViewUrls: loc?.streetViewUrls,
              }}
              castModelIds={shootLocation.modelIds}
              scheduledAt={scheduledAt}
              highlight={shot._id === highlightShotId}
            />
          ))}
        </div>
      )}

      <ImageLightbox
        images={references}
        index={refIndex}
        onIndexChange={setRefIndex}
        onClose={() => setRefIndex(null)}
      />
    </div>
  );
}
