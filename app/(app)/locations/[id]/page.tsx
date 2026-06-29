"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Pencil, ArrowLeft, Camera } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LocationEditor } from "@/components/location-editor";
import { PhotoMasonry } from "@/components/photo-masonry";
import type { Id } from "@/convex/_generated/dataModel";

export default function LocationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id as Id<"locations">;
  const location = useQuery(api.locations.get, { id });
  const photos = useQuery(api.generations.listByLocation, { locationId: id });

  if (location === undefined) {
    return (
      <>
        <PageHeader title={<Skeleton className="h-5 w-40" />} />
        <div className="p-6">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </>
    );
  }
  if (location === null) {
    return (
      <>
        <PageHeader title="Location not found" />
        <div className="p-6">
          <Button asChild>
            <Link href="/locations">Back to locations</Link>
          </Button>
        </div>
      </>
    );
  }

  const streetView = location.streetViewUrls ?? [];
  const ownImages = location.imageUrls ?? [];
  const refs = [...streetView, ...ownImages];

  return (
    <>
      <PageHeader title={location.name} description={location.address}>
        <Button asChild variant="ghost" size="sm">
          <Link href="/locations">
            <ArrowLeft className="h-4 w-4" /> Locations
          </Link>
        </Button>
        <LocationEditor
          location={location}
          trigger={
            <Button variant="outline" size="sm">
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          }
        />
      </PageHeader>

      <div className="space-y-6 p-4 md:p-6">
        {refs.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-muted-foreground text-sm font-medium">
              References ({refs.length})
            </h2>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {refs.map((r, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={r.url}
                  alt=""
                  className="h-28 w-40 shrink-0 rounded-lg border object-cover"
                />
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-medium">
            Photos shot here{" "}
            <span className="text-muted-foreground">
              ({photos?.length ?? 0})
            </span>
          </h2>
          <PhotoMasonry
            photos={photos?.map((p) => ({
              _id: p._id,
              imageUrl: p.imageUrl,
              caption: p.modelLabel,
            }))}
            emptyIcon={Camera}
            emptyTitle="No photos here yet"
            emptyDescription="Add this location to a shoot and generate shots — every image made here collects on this page."
          />
        </section>
      </div>
    </>
  );
}
