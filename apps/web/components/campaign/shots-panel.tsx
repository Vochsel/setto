"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { ImagePlus, Check, X, Camera } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Id } from "@/convex/_generated/dataModel";

export interface SelectedShot {
  generationId: string;
  shootId?: string;
  url: string;
}

export function ShotsPanel({
  campaignId,
  selected,
}: {
  campaignId: Id<"campaigns">;
  selected: SelectedShot[];
}) {
  // Optimistic update so the checkmark flips instantly on click, rather than
  // waiting on the mutation round-trip (which also re-resolves every selected
  // shot's storage URL server-side).
  const toggleShot = useMutation(api.campaigns.toggleShot).withOptimisticUpdate(
    (store, { id, generationId, shootId }) => {
      const campaign = store.getQuery(api.campaigns.get, { id });
      if (!campaign) return;
      const current = campaign.selectedShotImages ?? [];
      const exists = current.some((s) => s.generationId === generationId);
      const next = exists
        ? current.filter((s) => s.generationId !== generationId)
        : [
            ...current,
            {
              generationId,
              shootId,
              // Grab the thumbnail from the open photo list so the selected
              // grid shows it immediately; falls back to "" until the server
              // resolves the real URL.
              url:
                store
                  .getQuery(api.generations.listByOrg, {})
                  ?.find((p) => p._id === generationId)?.imageUrl ?? "",
            },
          ];
      store.setQuery(
        api.campaigns.get,
        { id },
        { ...campaign, selectedShotImages: next },
      );
    },
  );
  const selectedIds = new Set(selected.map((s) => s.generationId));

  function toggle(generationId: Id<"generations">, shootId?: Id<"shoots">) {
    toggleShot({ id: campaignId, generationId, shootId }).catch(() =>
      toast.error("Could not update selection"),
    );
  }

  return (
    <Card className="gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium">
            Shots{" "}
            <span className="text-muted-foreground">({selected.length})</span>
          </h2>
          <p className="text-muted-foreground text-xs">
            Pick photos from your shoots to feature in the ad.
          </p>
        </div>
        <PickShotsDialog
          selectedIds={selectedIds}
          onToggle={toggle}
          trigger={
            <Button variant="outline" size="sm">
              <ImagePlus className="h-4 w-4" /> Pick shots
            </Button>
          }
        />
      </div>

      {selected.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-xs">
          No shots selected yet.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {selected.map((s) => (
            <div
              key={s.generationId}
              className="group bg-muted/50 relative aspect-[3/4] overflow-hidden rounded-md border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.url} alt="" className="h-full w-full object-cover" />
              <button
                onClick={() =>
                  toggle(s.generationId as Id<"generations">)
                }
                className="absolute right-1 top-1 rounded bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="Remove shot"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function PickShotsDialog({
  selectedIds,
  onToggle,
  trigger,
}: {
  selectedIds: Set<string>;
  onToggle: (id: Id<"generations">, shootId?: Id<"shoots">) => void;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const photos = useQuery(api.generations.listByOrg, open ? {} : "skip");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Pick shots</DialogTitle>
        </DialogHeader>
        <div className="max-h-[75vh] overflow-y-auto">
          {photos === undefined ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4] rounded-md" />
              ))}
            </div>
          ) : photos.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 py-12 text-center text-sm">
              <Camera className="h-6 w-6" />
              No photos yet — generate some shots in a shoot first.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
              {photos.map((p) => {
                const active = selectedIds.has(p._id);
                return (
                  <button
                    key={p._id}
                    type="button"
                    onClick={() =>
                      onToggle(p._id, p.shootId ?? undefined)
                    }
                    className={cn(
                      "group relative aspect-[3/4] overflow-hidden rounded-md border-2 transition-colors",
                      active ? "border-primary" : "border-transparent",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.imageUrl}
                      alt={p.modelLabel ?? ""}
                      className="h-full w-full object-cover"
                    />
                    {active && (
                      <span className="bg-primary text-primary-foreground absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
