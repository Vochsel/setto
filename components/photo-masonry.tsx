"use client";

import { useState } from "react";
import { Images, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ImageLightbox } from "@/components/image-lightbox";

export interface MasonryPhoto {
  _id: string;
  imageUrl?: string;
  caption?: string;
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

  const valid = photos.filter((p) => p.imageUrl);

  if (valid.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  const images = valid.map((p) => ({ url: p.imageUrl, caption: p.caption }));

  return (
    <>
      <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 [&>*]:mb-3">
        {valid.map((p, i) => (
          <button
            key={p._id}
            type="button"
            onClick={() => setIndex(i)}
            className="hover:ring-primary/40 block w-full cursor-zoom-in overflow-hidden rounded-lg border break-inside-avoid transition-shadow hover:ring-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.imageUrl}
              alt={p.caption ?? ""}
              loading="lazy"
              className="w-full"
            />
          </button>
        ))}
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
