"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PhotoMasonry, mergeMedia } from "@/components/photo-masonry";

export function GalleryGrid() {
  const images = useQuery(api.generations.listByOrg, {});
  const videos = useQuery(api.videos.listByOrg, {});
  return <PhotoMasonry photos={mergeMedia(images, videos)} />;
}
