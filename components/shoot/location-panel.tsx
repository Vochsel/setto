"use client";

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
}: {
  shootLocation: ShootLocationDoc;
  shots: ShotDoc[];
  library: LibraryData;
  scheduledAt?: number;
  onRemoved: () => void;
}) {
  const setModels = useMutation(api.shootLocations.setModels);
  const removeLoc = useMutation(api.shootLocations.remove);
  const createShot = useMutation(api.shots.create);

  const loc = shootLocation.location;
  const presentModels =
    shootLocation.models.length > 0 ? shootLocation.models : library.models;

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

        {loc?.streetViewUrls?.length ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {loc.streetViewUrls.map((s, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={s.url}
                alt={s.caption ?? ""}
                title={s.caption}
                className="h-20 w-28 shrink-0 rounded-md object-cover"
              />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground bg-muted/40 rounded-md p-2 text-xs">
            No Street View references yet — open this location in the Locations
            library to capture some.
          </p>
        )}

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
              scheduledAt={scheduledAt}
            />
          ))}
        </div>
      )}
    </div>
  );
}
