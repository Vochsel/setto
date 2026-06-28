"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Images } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ImageLightbox } from "@/components/image-lightbox";

export function GalleryGrid() {
  const photos = useQuery(api.generations.listByOrg, {});
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

  if (photos.length === 0) {
    return (
      <EmptyState
        icon={Images}
        title="No photos yet"
        description="Generate images inside a shoot and they’ll collect here, newest first."
      />
    );
  }

  const images = photos.map((p) => ({
    url: p.imageUrl,
    caption: p.modelLabel,
  }));

  return (
    <>
      <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 [&>*]:mb-3">
        {photos.map((p, i) => (
          <button
            key={p._id}
            type="button"
            onClick={() => setIndex(i)}
            className="hover:ring-primary/40 block w-full cursor-zoom-in overflow-hidden rounded-lg border transition-shadow break-inside-avoid hover:ring-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.imageUrl}
              alt={p.modelLabel ?? ""}
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
