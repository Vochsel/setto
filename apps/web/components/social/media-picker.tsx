"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Film } from "lucide-react";
import { cn } from "@/lib/utils";

export type PickedMedia = {
  type: "image" | "video";
  url: string;
  thumbnailUrl?: string;
};

export function MediaPicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (media: PickedMedia[]) => void;
}) {
  const images = useQuery(api.generations.listByOrg, { limit: 80 });
  const videos = useQuery(api.videos.listByOrg, { limit: 40 });
  const [sel, setSel] = useState<Record<string, PickedMedia>>({});

  const items = [
    ...(videos ?? [])
      .filter((v) => v.videoUrl)
      .map((v) => ({
        key: `v:${v._id}`,
        thumb: v.thumbnailUrl ?? v.posterUrl,
        isVideo: true,
        media: {
          type: "video" as const,
          url: v.videoUrl!,
          thumbnailUrl: v.thumbnailUrl ?? v.posterUrl,
        },
      })),
    ...(images ?? [])
      .filter((g) => g.imageUrl)
      .map((g) => ({
        key: `i:${g._id}`,
        thumb: g.thumbnailUrl ?? g.imageUrl,
        isVideo: false,
        media: { type: "image" as const, url: g.imageUrl! },
      })),
  ];

  function toggle(key: string, media: PickedMedia) {
    setSel((s) => {
      const next = { ...s };
      if (next[key]) delete next[key];
      else next[key] = media;
      return next;
    });
  }

  const count = Object.keys(sel).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add from gallery</DialogTitle>
        </DialogHeader>
        <div className="grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 md:grid-cols-5">
          {items.map((it) => {
            const selected = !!sel[it.key];
            return (
              <button
                key={it.key}
                type="button"
                onClick={() => toggle(it.key, it.media)}
                className={cn(
                  "bg-muted relative aspect-square overflow-hidden rounded-lg ring-2 ring-transparent transition",
                  selected && "ring-primary",
                )}
              >
                {it.thumb && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.thumb}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
                {it.isVideo && (
                  <Film className="absolute left-1.5 top-1.5 h-4 w-4 text-white drop-shadow" />
                )}
                {selected && (
                  <div className="bg-primary text-primary-foreground absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full">
                    <Check className="h-3 w-3" />
                  </div>
                )}
              </button>
            );
          })}
          {items.length === 0 && (
            <p className="text-muted-foreground col-span-full py-8 text-center text-sm">
              No gallery media yet.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!count}
            onClick={() => {
              onPick(Object.values(sel));
              setSel({});
              onOpenChange(false);
            }}
          >
            Add {count || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
