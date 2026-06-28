"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Plus, Shirt, Layers } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { LibraryTile } from "@/components/library-tile";
import { DeleteOverlay } from "@/components/delete-overlay";
import { OutfitEditor } from "@/components/outfit-editor";

export default function OutfitsPage() {
  const outfits = useQuery(api.outfits.list, {});
  const remove = useMutation(api.outfits.remove);

  return (
    <>
      <PageHeader title="Outfits" description="Wardrobe and styling variations">
        <OutfitEditor
          trigger={
            <Button>
              <Plus className="h-4 w-4" /> New outfit
            </Button>
          }
        />
      </PageHeader>

      <div className="p-4 md:p-6">
        {outfits === undefined ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-xl" />
            ))}
          </div>
        ) : outfits.length === 0 ? (
          <EmptyState
            icon={Shirt}
            title="No outfits yet"
            description="Store wardrobe pieces with colorways and styling variations to batch-generate looks."
            action={
              <OutfitEditor
                trigger={
                  <Button>
                    <Plus className="h-4 w-4" /> New outfit
                  </Button>
                }
              />
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {outfits.map((o) => (
              <div key={o._id} className="group relative">
                <DeleteOverlay
                  title={`Delete ${o.name}?`}
                  onConfirm={async () => {
                    await remove({ id: o._id });
                    toast.success("Outfit deleted");
                  }}
                />
                <OutfitEditor
                  outfit={o}
                  trigger={
                    <button className="block w-full text-left">
                      <LibraryTile
                        icon={Shirt}
                        imageUrl={o.imageUrls?.[0]?.url}
                        title={o.name}
                        subtitle={o.category}
                        footer={
                          o.variationCount > 0 ? (
                            <Badge variant="secondary" className="gap-1">
                              <Layers className="h-3 w-3" />
                              {o.variationCount} variation
                              {o.variationCount === 1 ? "" : "s"}
                            </Badge>
                          ) : null
                        }
                      />
                    </button>
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
