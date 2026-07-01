"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Heart, Images, Star, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/page-header";
import { PhotoMasonry, mergeMedia } from "@/components/photo-masonry";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REVIEW_STATUSES, type ReviewStatus } from "@/components/review-controls";
import { cn } from "@/lib/utils";

const ALL = "__all__";
const UNREVIEWED = "__unreviewed__";

type MediaKind = "all" | "image" | "video";

/** Shared review/attribution fields the filters key off (images & videos). */
interface Filterable {
  rating?: number;
  reviewStatus?: ReviewStatus;
  favorite?: boolean;
  modelId?: string;
}

export default function GalleryPage() {
  const images = useQuery(api.generations.listByOrg, {});
  const videos = useQuery(api.videos.listByOrg, {});
  const renders = useQuery(api.videoRenders.listByOrg, {});
  const models = useQuery(api.models.list, {});

  // Exported edited videos live alongside i2v `videos` in the feed.
  const allVideos = useMemo(
    () => (videos && renders ? [...videos, ...renders] : undefined),
    [videos, renders],
  );

  const [kind, setKind] = useState<MediaKind>("all");
  const [modelId, setModelId] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [minRating, setMinRating] = useState<number>(0);
  const [favOnly, setFavOnly] = useState(false);

  const active =
    kind !== "all" ||
    modelId !== ALL ||
    status !== ALL ||
    minRating > 0 ||
    favOnly;

  function reset() {
    setKind("all");
    setModelId(ALL);
    setStatus(ALL);
    setMinRating(0);
    setFavOnly(false);
  }

  const matches = useMemo(() => {
    return (item: Filterable): boolean => {
      if (favOnly && !item.favorite) return false;
      if (minRating > 0 && (item.rating ?? 0) < minRating) return false;
      if (status === UNREVIEWED) {
        if (item.reviewStatus) return false;
      } else if (status !== ALL && item.reviewStatus !== status) {
        return false;
      }
      if (modelId !== ALL && item.modelId !== modelId) return false;
      return true;
    };
  }, [favOnly, minRating, status, modelId]);

  const filteredImages = useMemo(
    () =>
      images === undefined
        ? undefined
        : kind === "video"
          ? []
          : images.filter(matches),
    [images, kind, matches],
  );
  const filteredVideos = useMemo(
    () =>
      allVideos === undefined
        ? undefined
        : kind === "image"
          ? []
          : allVideos.filter(matches),
    [allVideos, kind, matches],
  );

  const photos = mergeMedia(filteredImages, filteredVideos);

  return (
    <>
      <PageHeader
        title="Gallery"
        description="Every image & video across the workspace"
      />

      <div className="space-y-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          {/* Media type */}
          <Select value={kind} onValueChange={(v) => setKind(v as MediaKind)}>
            <SelectTrigger size="sm" className="w-32" title="Media type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All media</SelectItem>
              <SelectItem value="image">Images</SelectItem>
              <SelectItem value="video">Videos</SelectItem>
            </SelectContent>
          </Select>

          {/* Model */}
          <Select value={modelId} onValueChange={setModelId}>
            <SelectTrigger size="sm" className="w-40" title="Model">
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

          {/* Status */}
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger size="sm" className="w-40" title="Review status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any status</SelectItem>
              {REVIEW_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
              <SelectItem value={UNREVIEWED}>Unreviewed</SelectItem>
            </SelectContent>
          </Select>

          {/* Min rating */}
          <Select
            value={String(minRating)}
            onValueChange={(v) => setMinRating(Number(v))}
          >
            <SelectTrigger size="sm" className="w-32" title="Minimum rating">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Any rating</SelectItem>
              {[1, 2, 3, 4, 5].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n === 5 ? "5 stars" : `${n}+ stars`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Favorites */}
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

          {active && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={reset}
              className="text-muted-foreground gap-1"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}

          {photos !== undefined && (
            <span className="text-muted-foreground ml-auto text-xs tabular-nums">
              {photos.length} item{photos.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        <PhotoMasonry
          photos={photos}
          emptyIcon={active ? Star : Images}
          emptyTitle={active ? "Nothing matches these filters" : "No media yet"}
          emptyDescription={
            active
              ? "Try clearing a filter or two."
              : "Generate images inside a shoot and they’ll collect here, newest first."
          }
        />
      </div>
    </>
  );
}
