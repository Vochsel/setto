"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Images, Play, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ImageLightbox } from "@/components/image-lightbox";
import {
  FavoriteButton,
  ReviewBadges,
  type ReviewStatus,
} from "@/components/review-controls";
import { cn } from "@/lib/utils";

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
  /** Review state (rating / status / favorite). */
  rating?: number;
  reviewStatus?: ReviewStatus;
  favorite?: boolean;
}

type ReviewRow = {
  rating?: number;
  reviewStatus?: ReviewStatus;
  favorite?: boolean;
};
type ImageRow = ReviewRow & {
  _id: string;
  _creationTime: number;
  imageUrl?: string;
  modelLabel?: string;
};
type VideoRow = ReviewRow & {
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
        rating: p.rating,
        reviewStatus: p.reviewStatus,
        favorite: p.favorite,
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
        rating: v.rating,
        reviewStatus: v.reviewStatus,
        favorite: v.favorite,
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
 * Reports when `ref`'s element has scrolled near the viewport, then stops
 * observing (once loaded, stays loaded). `rootMargin` loads media slightly
 * ahead of view so it's ready by the time the tile is on screen.
 */
function useInViewport<T extends Element>(rootMargin = "300px") {
  const ref = useRef<T | null>(null);
  // No IntersectionObserver (e.g. SSR/old browsers): start "in view" so media
  // loads eagerly rather than never.
  const [inView, setInView] = useState(
    () => typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, rootMargin]);

  return [ref, inView] as const;
}

/**
 * A single masonry tile. Images lazy-load natively; videos are gated behind an
 * IntersectionObserver — until the tile nears the viewport we render only the
 * poster, so offscreen videos don't all autoplay and download at once.
 */
function MasonryTile({
  photo,
  onOpen,
}: {
  photo: MasonryPhoto;
  onOpen: () => void;
}) {
  const [ref, inView] = useInViewport<HTMLDivElement>();
  const thumb = thumbOf(photo);

  return (
    <div
      ref={ref}
      className="group relative block break-inside-avoid overflow-hidden rounded-lg border"
    >
      <button
        type="button"
        onClick={onOpen}
        className="hover:ring-primary/40 block w-full cursor-zoom-in transition-shadow hover:ring-2"
      >
        {photo.kind === "video" ? (
          inView ? (
            // Ambient preview: autoplay muted + loop. Click opens the
            // fullscreen player (with sound). Poster covers initial load.
            <video
              src={photo.videoUrl}
              poster={photo.posterUrl}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              className="pointer-events-none w-full"
            />
          ) : photo.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo.posterUrl}
              alt={photo.caption ?? ""}
              loading="lazy"
              className="w-full"
            />
          ) : (
            <div className="bg-muted aspect-[3/4] w-full" />
          )
        ) : thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt={photo.caption ?? ""}
            loading="lazy"
            className="w-full"
          />
        ) : (
          <div className="bg-muted aspect-[3/4] w-full" />
        )}
      </button>

      {/* Favorite heart — shown on hover, or always once favorited. */}
      <FavoriteButton
        mediaId={photo._id}
        favorite={photo.favorite}
        theme="dark"
        className={cn(
          "absolute left-1.5 top-1.5 opacity-0 transition group-hover:opacity-100",
          photo.favorite && "opacity-100",
        )}
      />

      {/* Rating + status indicators (read-only). */}
      <ReviewBadges
        rating={photo.rating}
        reviewStatus={photo.reviewStatus}
        className="absolute right-1.5 top-1.5"
      />

      {photo.kind === "video" ? (
        <span className="pointer-events-none absolute bottom-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/20 backdrop-blur transition group-hover:bg-black/70">
          <Play className="h-3 w-3 translate-x-px" fill="currentColor" />
        </span>
      ) : null}
    </div>
  );
}

/** How many tiles to reveal per "page" as the user scrolls. */
const PAGE = 16;

/** Responsive column count (2 / 3 / 4) tracked so we can flow items row-major. */
function useColumnCount() {
  const [n, setN] = useState(4);
  useEffect(() => {
    const compute = () =>
      setN(
        window.innerWidth < 640 ? 2 : window.innerWidth < 1024 ? 3 : 4,
      );
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);
  return n;
}

/**
 * Masonry photo grid with a built-in lightbox. Pass `undefined` while loading
 * to render skeletons. Used by the gallery and the per-model / per-location
 * photo pages.
 *
 * Newest-first ordering flows LEFT-TO-RIGHT (round-robin across columns), so the
 * top row is the most recent media, and tiles are revealed incrementally on
 * scroll rather than all at once.
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
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const columnCount = useColumnCount();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const valid = useMemo(
    () => (photos ?? []).filter(isDisplayable),
    [photos],
  );
  const hasMore = visibleCount < valid.length;

  // Reveal more as the sentinel nears the viewport. Re-observing on each bump
  // keeps loading while the sentinel stays in view (short feeds fill instantly).
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((c) => c + PAGE);
        }
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, visibleCount, columnCount]);

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
          mediaId: p._id,
          rating: p.rating,
          reviewStatus: p.reviewStatus,
          favorite: p.favorite,
        }
      : {
          url: p.imageUrl,
          caption: p.caption,
          generationId: p.generationId,
          mediaId: p._id,
          rating: p.rating,
          reviewStatus: p.reviewStatus,
          favorite: p.favorite,
        },
  );

  // Round-robin the visible prefix into columns → newest reads left-to-right.
  const visible = valid.slice(0, visibleCount);
  const columns: { photo: MasonryPhoto; flatIndex: number }[][] = Array.from(
    { length: columnCount },
    () => [],
  );
  visible.forEach((photo, i) =>
    columns[i % columnCount].push({ photo, flatIndex: i }),
  );

  return (
    <>
      <div className="flex items-start gap-3">
        {columns.map((col, ci) => (
          <div key={ci} className="flex min-w-0 flex-1 flex-col gap-3">
            {col.map(({ photo, flatIndex }) => (
              <MasonryTile
                key={photo._id}
                photo={photo}
                onOpen={() => setIndex(flatIndex)}
              />
            ))}
          </div>
        ))}
      </div>
      {hasMore ? <div ref={sentinelRef} className="h-8 w-full" /> : null}
      <ImageLightbox
        images={images}
        index={index}
        onIndexChange={setIndex}
        onClose={() => setIndex(null)}
      />
    </>
  );
}
