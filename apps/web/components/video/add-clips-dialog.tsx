"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { MediaInput } from "@setto/core/video";
import { Check, Heart, ImageOff, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const ALL = "__all__";

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

  // Filters
  const [shoot, setShoot] = useState<string>(shootId ?? ALL);
  const [model, setModel] = useState<string>(ALL);
  const [wardrobe, setWardrobe] = useState<string>(ALL);
  const [favOnly, setFavOnly] = useState(false);

  const images = useQuery(api.generations.listByOrg, {});
  const videos = useQuery(api.videos.listByOrg, {});
  const shoots = useQuery(api.shoots.list, {});
  const models = useQuery(api.models.list, {});
  const outfits = useQuery(api.outfits.list, {});

  const imageItems = useMemo(
    () =>
      (images ?? []).filter(
        (g) =>
          g.imageUrl &&
          (shoot === ALL || g.shootId === shoot) &&
          (model === ALL || g.modelId === model) &&
          (wardrobe === ALL || g.outfitId === wardrobe) &&
          (!favOnly || g.favorite),
      ),
    [images, shoot, model, wardrobe, favOnly],
  );

  // Videos carry no wardrobe (outfit) snapshot, so the wardrobe filter can't
  // apply to them — when it's set, the Motion tab shows a note instead.
  const videoItems = useMemo(
    () =>
      (videos ?? []).filter(
        (v) =>
          v.videoUrl &&
          (shoot === ALL || v.shootId === shoot) &&
          (model === ALL || v.modelId === model) &&
          (!favOnly || v.favorite),
      ),
    [videos, shoot, model, favOnly],
  );

  const filtersActive =
    shoot !== (shootId ?? ALL) ||
    model !== ALL ||
    wardrobe !== ALL ||
    favOnly;

  function resetFilters() {
    setShoot(shootId ?? ALL);
    setModel(ALL);
    setWardrobe(ALL);
    setFavOnly(false);
  }

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
  const shown = tab === "images" ? imageItems.length : videoItems.length;
  const wardrobeBlocksVideos = tab === "videos" && wardrobe !== ALL;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[96vw] flex-col sm:max-w-[1600px]">
        <DialogHeader>
          <DialogTitle>Add clips</DialogTitle>
        </DialogHeader>

        {/* Type + filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="images">Images</TabsTrigger>
              <TabsTrigger value="videos">Motion clips</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="bg-border mx-1 h-5 w-px" />

          <Select value={shoot} onValueChange={setShoot}>
            <SelectTrigger size="sm" className="w-36" title="Shoot">
              <SelectValue placeholder="Shoot" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All shoots</SelectItem>
              {(shoots ?? []).map((s) => (
                <SelectItem key={s._id} value={s._id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={model} onValueChange={setModel}>
            <SelectTrigger size="sm" className="w-36" title="Model">
              <SelectValue placeholder="Model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All models</SelectItem>
              {(models ?? []).map((m) => (
                <SelectItem key={m._id} value={m._id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={wardrobe} onValueChange={setWardrobe}>
            <SelectTrigger size="sm" className="w-36" title="Wardrobe">
              <SelectValue placeholder="Wardrobe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All wardrobe</SelectItem>
              {(outfits ?? []).map((o) => (
                <SelectItem key={o._id} value={o._id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant={favOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setFavOnly((f) => !f)}
            className="gap-1.5"
          >
            <Heart
              className={cn("h-4 w-4", favOnly && "text-red-200")}
              fill={favOnly ? "currentColor" : "none"}
            />
            Favorites
          </Button>

          {filtersActive ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="text-muted-foreground gap-1"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          ) : null}

          <span className="text-muted-foreground ml-auto text-xs tabular-nums">
            {shown} item{shown === 1 ? "" : "s"}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[9/16] rounded-lg" />
              ))}
            </div>
          ) : tab === "images" ? (
            imageItems.length === 0 ? (
              <Empty label="No images match these filters" />
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12">
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
                      favorite={g.favorite}
                      onClick={() => toggle(key, media)}
                    />
                  );
                })}
              </div>
            )
          ) : wardrobeBlocksVideos ? (
            <Empty label="Wardrobe filtering isn’t available for motion clips — clear it to see clips." />
          ) : videoItems.length === 0 ? (
            <Empty label="No motion clips match these filters" />
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12">
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
                    favorite={v.favorite}
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
  favorite,
}: {
  url: string;
  picked: boolean;
  onClick: () => void;
  isVideo?: boolean;
  favorite?: boolean;
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
      <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
      {favorite ? (
        <span className="absolute top-1 left-1 rounded-full bg-black/55 p-0.5 text-red-300">
          <Heart className="h-3 w-3" fill="currentColor" />
        </span>
      ) : null}
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
    <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 py-16 text-center text-sm">
      <ImageOff className="h-6 w-6" />
      <span className="max-w-xs">{label}</span>
    </div>
  );
}
