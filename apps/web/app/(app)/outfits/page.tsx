"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Plus, Shirt, Layers, Tags } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { LibraryTile } from "@/components/library-tile";
import { DeleteOverlay } from "@/components/delete-overlay";
import { OutfitEditor } from "@/components/outfit-editor";
import { ManageCategoriesDialog } from "@/components/manage-categories-dialog";
import { cn } from "@/lib/utils";

const ALL = "__all__";
const UNCATEGORISED = "__uncategorised__";

export default function OutfitsPage() {
  const outfits = useQuery(api.outfits.list, {});
  const categories = useQuery(api.outfitCategories.list, {});
  const remove = useMutation(api.outfits.remove);
  const [filter, setFilter] = useState<string>(ALL);

  const shown =
    filter === ALL
      ? outfits
      : outfits?.filter((o) =>
          filter === UNCATEGORISED
            ? !o.categoryId
            : o.categoryId === filter,
        );

  const hasFilters = (categories?.length ?? 0) > 0;

  return (
    <>
      <PageHeader
        title="Wardrobe"
        description="Clothing, hats, bags & accessories — with styling variations"
      >
        <ManageCategoriesDialog
          trigger={
            <Button variant="outline">
              <Tags className="h-4 w-4" /> Categories
            </Button>
          }
        />
        <OutfitEditor
          trigger={
            <Button>
              <Plus className="h-4 w-4" /> New item
            </Button>
          }
        />
      </PageHeader>

      <div className="space-y-4 p-4 md:p-6">
        {hasFilters && (outfits?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <FilterPill
              label="All"
              active={filter === ALL}
              onClick={() => setFilter(ALL)}
            />
            {categories?.map((c) => (
              <FilterPill
                key={c._id}
                label={c.name}
                count={c.count}
                active={filter === c._id}
                onClick={() => setFilter(c._id)}
              />
            ))}
            <FilterPill
              label="Uncategorised"
              active={filter === UNCATEGORISED}
              onClick={() => setFilter(UNCATEGORISED)}
            />
          </div>
        )}

        {outfits === undefined ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-xl" />
            ))}
          </div>
        ) : outfits.length === 0 ? (
          <EmptyState
            icon={Shirt}
            title="Your wardrobe is empty"
            description="Store clothing, hats, bags and accessories with colorways and styling variations to batch-generate looks."
            action={
              <OutfitEditor
                trigger={
                  <Button>
                    <Plus className="h-4 w-4" /> New item
                  </Button>
                }
              />
            }
          />
        ) : shown && shown.length === 0 ? (
          <EmptyState
            icon={Shirt}
            title="Nothing here yet"
            description="No items in this category."
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {shown?.map((o) => (
              <div key={o._id} className="group relative">
                <DeleteOverlay
                  title={`Delete ${o.name}?`}
                  onConfirm={async () => {
                    await remove({ id: o._id });
                    toast.success("Item deleted");
                  }}
                />
                {/* Click → the item's page (product images + every shot it's in) */}
                <Link href={`/outfits/${o._id}`} className="block">
                  <LibraryTile
                    icon={Shirt}
                    imageUrl={o.imageUrls?.[0]?.url}
                    title={o.name}
                    subtitle={o.categoryName}
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
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border hover:bg-muted",
      )}
    >
      {label}
      {count !== undefined && count > 0 ? (
        <span className={cn("ml-1.5", active ? "opacity-80" : "text-muted-foreground")}>
          {count}
        </span>
      ) : null}
    </button>
  );
}
