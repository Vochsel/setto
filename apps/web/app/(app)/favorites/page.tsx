"use client";

import { Heart } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/page-header";
import {
  PhotoMasonry,
  type MasonryPhoto,
} from "@/components/photo-masonry";

export default function FavoritesPage() {
  const favorites = useQuery(api.review.favorites, {});

  const photos: MasonryPhoto[] | undefined = favorites?.map((it) =>
    it.kind === "video"
      ? {
          _id: it._id,
          kind: "video" as const,
          videoUrl: it.url,
          posterUrl: it.posterUrl,
          caption: it.modelLabel,
          rating: it.rating,
          reviewStatus: it.reviewStatus,
          favorite: it.favorite,
        }
      : {
          _id: it._id,
          kind: "image" as const,
          imageUrl: it.url,
          caption: it.modelLabel,
          generationId: it._id,
          rating: it.rating,
          reviewStatus: it.reviewStatus,
          favorite: it.favorite,
        },
  );

  return (
    <>
      <PageHeader
        title="Favorites"
        description="Every image & video you’ve hearted, newest first"
      />
      <div className="p-4 md:p-6">
        <PhotoMasonry
          photos={photos}
          emptyIcon={Heart}
          emptyTitle="No favorites yet"
          emptyDescription="Tap the heart on any image or video and it’ll collect here."
        />
      </div>
    </>
  );
}
