"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Plus, MapPin } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import Link from "next/link";
import { LibraryTile } from "@/components/library-tile";
import { DeleteOverlay } from "@/components/delete-overlay";
import { LocationPickerDialog } from "@/components/location-picker-dialog";

export default function LocationsPage() {
  const locations = useQuery(api.locations.list, {});
  const remove = useMutation(api.locations.remove);

  return (
    <>
      <PageHeader title="Locations" description="Real places to shoot in">
        <LocationPickerDialog
          trigger={
            <Button>
              <Plus className="h-4 w-4" /> New location
            </Button>
          }
        />
      </PageHeader>

      <div className="p-4 md:p-6">
        {locations === undefined ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-video rounded-xl" />
            ))}
          </div>
        ) : locations.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No locations yet"
            description="Pin a real place on the map; we’ll grab Street View imagery to ground the backdrop."
            action={
              <LocationPickerDialog
                trigger={
                  <Button>
                    <Plus className="h-4 w-4" /> New location
                  </Button>
                }
              />
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {locations.map((l) => {
              const thumb = l.imageUrls?.[0]?.url ?? l.streetViewUrls?.[0]?.url;
              return (
                <div key={l._id} className="group relative">
                  <DeleteOverlay
                    title={`Delete ${l.name}?`}
                    onConfirm={async () => {
                      await remove({ id: l._id });
                      toast.success("Location deleted");
                    }}
                  />
                  <Link href={`/locations/${l._id}`} className="block">
                    <LibraryTile
                      icon={MapPin}
                      aspect="video"
                      imageUrl={thumb}
                      title={l.name}
                      subtitle={l.address}
                      footer={
                        l.streetViewUrls?.length ? (
                          <Badge variant="secondary">
                            {l.streetViewUrls.length} Street View
                          </Badge>
                        ) : null
                      }
                    />
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
