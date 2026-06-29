"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PhotoMasonry } from "@/components/photo-masonry";

export function GalleryGrid() {
  const photos = useQuery(api.generations.listByOrg, {});
  return (
    <PhotoMasonry
      photos={photos?.map((p) => ({
        _id: p._id,
        imageUrl: p.imageUrl,
        caption: p.modelLabel,
      }))}
    />
  );
}
