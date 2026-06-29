"use client";

import { useState } from "react";
import { Images, Play, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ImageLightbox } from "@/components/image-lightbox";

export interface MasonryPhoto {
  _id: string;
  /** "video" renders a poster + play badge and plays in the lightbox. */
  kind?: "image" | "video";
  imageUrl?: string; // image url (kind "image")
  videoUrl?: string; // video url (kind "video")
  posterUrl?: string; // poster frame for a video tile
  caption?: string;
  /** Source generation id for an image — enables "Animate" in the lightbox. */
  generationId?: string;
}

type ImageRow = {
  _id: string;
  _creationTime: number;
  imageUrl?: string;
  modelLabel?: string;
};
type VideoRow = {
  _id: string;
  _creationTime: number;
  videoUrl?: string;
  posterUrl?: string;
  modelLabel?: string;
};

/**
 * Merge succeeded images + videos into one newest-first `MasonryPhoto[]` feed.
 * Returns `undefined` while either source is still loading (so the grid shows
 * skeletons). Shared by the gallery and the per-model / per-location pages.
 */
export function mergeMedia(
  images: ImageRow[] | undefined,
  videos: VideoRow[] | undefined,
): MasonryPhoto[] | undefined {
  if (images === undefined || videos === undefined) return undefined;
  return [
    ...images.map((p) => ({
      t: p._creationTime,
      photo: {
        _id: p._id,
        kind: "image" as const,
        imageUrl: p.imageUrl,
        caption: p.modelLabel,
        generationId: p._id, // image rows come from `generations`
      } satisfies MasonryPhoto,
    })),
    ...videos.map((v) => ({
      t: v._creationTime,
      photo: {
        _id: v._id,
        kind: "video" as const,
        videoUrl: v.videoUrl,
        posterUrl: v.posterUrl,
        caption: v.modelLabel,
      } satisfies MasonryPhoto,
    })),
  ]
    .sort((a, b) => b.t - a.t)
    .map((x) => x.photo);
}

/** The thumbnail a tile renders: the image, or a video's poster frame. */
function thumbOf(p: MasonryPhoto): string | undefined {
  return p.kind === "video" ? p.posterUrl : p.imageUrl;
}

/** Whether a photo has the media it needs to be shown. */
function isDisplayable(p: MasonryPhoto): boolean {
  return p.kind === "video" ? Boolean(p.videoUrl) : Boolean(p.imageUrl);
}

/**
 * Masonry photo grid with a built-in lightbox. Pass `undefined` while loading
 * to render skeletons. Used by the gallery and the per-model / per-location
 * photo pages.
 */
export function PhotoMasonry({
  photos,
  emptyIcon = Images,
  emptyTitle = "No photos yet",
  emptyDescription = "Generate images inside a shoot and they’ll collect here, newest first.",
}: {
  photos: MasonryPhoto[] | undefined;
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const [index, setIndex] = useState<number | null>(null);

  if (photos === undefined) {
    return (
      <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 [&>*]:mb-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton
            key={i}
            className="w-full rounded-lg"
            style={{ height: `${160 + ((i * 47) % 140)}px` }}
          />
        ))}
      </div>
    );
  }

  const valid = photos.filter(isDisplayable);

  if (valid.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  const images = valid.map((p) =>
    p.kind === "video"
      ? {
          kind: "video" as const,
          url: p.videoUrl,
          posterUrl: p.posterUrl,
          caption: p.caption,
        }
      : {
          url: p.imageUrl,
          caption: p.caption,
          generationId: p.generationId,
        },
  );

  return (
    <>
      <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 [&>*]:mb-3">
        {valid.map((p, i) => {
          const thumb = thumbOf(p);
          return (
            <button
              key={p._id}
              type="button"
              onClick={() => setIndex(i)}
              className="hover:ring-primary/40 group relative block w-full cursor-zoom-in overflow-hidden rounded-lg border break-inside-avoid transition-shadow hover:ring-2"
            >
              {p.kind === "video" ? (
                // Ambient preview: autoplay muted + loop. Click opens the
                // fullscreen player (with sound). Poster covers initial load.
                <video
                  src={p.videoUrl}
                  poster={p.posterUrl}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  className="pointer-events-none w-full"
                />
              ) : thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumb}
                  alt={p.caption ?? ""}
                  loading="lazy"
                  className="w-full"
                />
              ) : (
                <div className="bg-muted aspect-[3/4] w-full" />
              )}
              {p.kind === "video" ? (
                <span className="pointer-events-none absolute bottom-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/20 backdrop-blur transition group-hover:bg-black/70">
                  <Play className="h-3 w-3 translate-x-px" fill="currentColor" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <ImageLightbox
        images={images}
        index={index}
        onIndexChange={setIndex}
        onClose={() => setIndex(null)}
      />
    </>
  );
}
