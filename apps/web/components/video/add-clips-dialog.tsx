"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { MediaInput } from "@setto/core/video";
import { Check, ImageOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function AddClipsDialog({
  open,
  onOpenChange,
  shootId,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shootId?: Id<"shoots">;
  onAdd: (media: MediaInput[]) => void;
}) {
  const [tab, setTab] = useState<"images" | "videos">("images");
  const [picked, setPicked] = useState<Record<string, MediaInput>>({});

  const images = useQuery(api.generations.listByOrg, {});
  const videos = useQuery(api.videos.listByOrg, {});

  const imageItems = (images ?? []).filter(
    (g) => g.imageUrl && (!shootId || g.shootId === shootId),
  );
  const videoItems = (videos ?? []).filter(
    (v) => v.videoUrl && (!shootId || v.shootId === shootId),
  );

  function toggle(key: string, media: MediaInput) {
    setPicked((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = media;
      return next;
    });
  }

  function confirm() {
    onAdd(Object.values(picked));
    setPicked({});
    onOpenChange(false);
  }

  const count = Object.keys(picked).length;
  const loading =
    (tab === "images" && images === undefined) ||
    (tab === "videos" && videos === undefined);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add clips</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="images">Images</TabsTrigger>
            <TabsTrigger value="videos">Motion clips</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="max-h-[55vh] overflow-y-auto">
          {loading ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[9/16] rounded-lg" />
              ))}
            </div>
          ) : tab === "images" ? (
            imageItems.length === 0 ? (
              <Empty label="No finished images yet" />
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {imageItems.map((g) => {
                  const key = `g:${g._id}`;
                  const media: MediaInput = {
                    sourceType: "image",
                    url: g.imageUrl!,
                    generationId: g._id as string,
                    shotId: g.shotId as string,
                  };
                  return (
                    <PickTile
                      key={key}
                      url={g.imageUrl!}
                      picked={!!picked[key]}
                      onClick={() => toggle(key, media)}
                    />
                  );
                })}
              </div>
            )
          ) : videoItems.length === 0 ? (
            <Empty label="No motion clips yet" />
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {videoItems.map((v) => {
                const key = `v:${v._id}`;
                const media: MediaInput = {
                  sourceType: "video",
                  url: v.videoUrl!,
                  posterUrl: v.posterUrl ?? undefined,
                  videoId: v._id as string,
                  shotId: v.shotId as string,
                };
                return (
                  <PickTile
                    key={key}
                    url={v.posterUrl ?? v.videoUrl!}
                    picked={!!picked[key]}
                    onClick={() => toggle(key, media)}
                    isVideo
                  />
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={count === 0}>
            Add {count > 0 ? count : ""} clip{count === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PickTile({
  url,
  picked,
  onClick,
  isVideo,
}: {
  url: string;
  picked: boolean;
  onClick: () => void;
  isVideo?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "bg-muted relative aspect-[9/16] overflow-hidden rounded-lg border transition",
        picked ? "ring-foreground ring-2" : "hover:border-foreground/30",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="h-full w-full object-cover" />
      {isVideo ? (
        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">
          clip
        </span>
      ) : null}
      {picked ? (
        <span className="bg-foreground text-background absolute top-1 right-1 rounded-full p-0.5">
          <Check className="h-3 w-3" />
        </span>
      ) : null}
    </button>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 py-12 text-sm">
      <ImageOff className="h-6 w-6" />
      {label}
    </div>
  );
}
