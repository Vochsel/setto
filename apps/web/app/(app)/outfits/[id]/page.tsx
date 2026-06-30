"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Pencil, Shirt, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { MakeVideoButton } from "@/components/video/make-video-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { OutfitEditor } from "@/components/outfit-editor";
import { PhotoMasonry, mergeMedia } from "@/components/photo-masonry";
import type { Id } from "@/convex/_generated/dataModel";

export default function OutfitDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id as Id<"outfits">;
  const outfit = useQuery(api.outfits.get, { id });
  const images = useQuery(api.generations.listByOutfit, { outfitId: id });
  const videos = useQuery(api.videos.listByOutfit, { outfitId: id });
  const photos = mergeMedia(images, videos);

  if (outfit === undefined) {
    return (
      <>
        <PageHeader title={<Skeleton className="h-5 w-40" />} />
        <div className="p-6">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </>
    );
  }
  if (outfit === null) {
    return (
      <>
        <PageHeader title="Item not found" />
        <div className="p-6">
          <Button asChild>
            <Link href="/outfits">Back to wardrobe</Link>
          </Button>
        </div>
      </>
    );
  }

  const refs = (outfit.imageUrls ?? []).filter((r) => r?.url);

  return (
    <>
      <PageHeader
        title={outfit.name}
        description={outfit.promptDescriptor ?? outfit.description}
      >
        <Button asChild variant="ghost" size="sm">
          <Link href="/outfits">
            <ArrowLeft className="h-4 w-4" /> Wardrobe
          </Link>
        </Button>
        {images && images.length > 0 && (
          <MakeVideoButton
            generationIds={images.map((g) => g._id)}
            size="sm"
          />
        )}
        <OutfitEditor
          outfit={outfit}
          trigger={
            <Button variant="outline" size="sm">
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          }
        />
      </PageHeader>

      <div className="space-y-6 p-4 md:p-6">
        {(outfit.categoryName || (outfit.variations?.length ?? 0) > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {outfit.categoryName && (
              <Badge variant="secondary">{outfit.categoryName}</Badge>
            )}
            {(outfit.variations?.length ?? 0) > 0 && (
              <Badge variant="outline">
                {outfit.variations!.length} variation
                {outfit.variations!.length === 1 ? "" : "s"}
              </Badge>
            )}
          </div>
        )}

        {refs.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-muted-foreground text-sm font-medium">
              Product images
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {refs.map((r, i) => (
                <figure key={i} className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.url}
                    alt={r.caption ?? "Product reference"}
                    className="h-40 w-32 rounded-lg border object-cover"
                  />
                </figure>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-medium">
            Photos &amp; videos featuring {outfit.name}{" "}
            <span className="text-muted-foreground">
              ({photos?.length ?? 0})
            </span>
          </h2>
          <PhotoMasonry
            photos={photos}
            emptyIcon={Shirt}
            emptyTitle={`No photos with ${outfit.name} yet`}
            emptyDescription="Use this item in a shoot and generate — every image and video it appears in collects here."
          />
        </section>
      </div>
    </>
  );
}
