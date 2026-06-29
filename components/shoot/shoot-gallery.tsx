"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Images, Star, Heart, Check, X, MessageSquare } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ImageLightbox } from "@/components/image-lightbox";
import { ReviewPanel, ReviewBadges } from "@/components/shoot/image-review";
import { cn } from "@/lib/utils";
import type { Id } from "@/convex/_generated/dataModel";
import type { Approval, ReviewComment } from "@/components/shoot/types";

interface ReviewPhoto {
  _id: Id<"generations">;
  imageUrl?: string;
  modelLabel?: string;
  prompt: string;
  favorite: boolean;
  rating: number;
  approval: Approval;
  comments: ReviewComment[];
}

type FilterKey =
  | "all"
  | "favorites"
  | "approved"
  | "rejected"
  | "pending"
  | "rated"
  | "commented";

const FILTERS: { key: FilterKey; label: string; icon?: typeof Star }[] = [
  { key: "all", label: "All" },
  { key: "favorites", label: "Favorites", icon: Heart },
  { key: "approved", label: "Approved", icon: Check },
  { key: "rejected", label: "Rejected", icon: X },
  { key: "pending", label: "Pending" },
  { key: "rated", label: "Rated", icon: Star },
  { key: "commented", label: "Commented", icon: MessageSquare },
];

function matches(p: ReviewPhoto, f: FilterKey): boolean {
  switch (f) {
    case "favorites":
      return p.favorite;
    case "approved":
      return p.approval === "approved";
    case "rejected":
      return p.approval === "rejected";
    case "pending":
      return p.approval === null;
    case "rated":
      return p.rating > 0;
    case "commented":
      return p.comments.length > 0;
    default:
      return true;
  }
}

export function ShootGallery({ shootId }: { shootId: Id<"shoots"> }) {
  const photos = useQuery(api.generations.reviewByShoot, { shootId }) as
    | ReviewPhoto[]
    | undefined;

  const [filter, setFilter] = useState<FilterKey>("all");
  const [minRating, setMinRating] = useState(0);
  const [index, setIndex] = useState<number | null>(null);

  const filtered = useMemo(() => {
    if (!photos) return undefined;
    return photos.filter(
      (p) => matches(p, filter) && p.rating >= minRating,
    );
  }, [photos, filter, minRating]);

  // Per-filter counts for the toolbar chips.
  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: 0,
      favorites: 0,
      approved: 0,
      rejected: 0,
      pending: 0,
      rated: 0,
      commented: 0,
    };
    for (const p of photos ?? []) {
      for (const f of FILTERS) if (matches(p, f.key)) c[f.key]++;
    }
    return c;
  }, [photos]);

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
        description="Generate images from the shots in this shoot and they'll collect here to rate, approve and comment on."
      />
    );
  }

  const valid = filtered ?? [];
  const current = index !== null ? valid[index] : undefined;
  const lightboxImages = valid.map((p) => ({
    url: p.imageUrl,
    caption: p.modelLabel ?? p.prompt,
  }));

  return (
    <div className="space-y-4">
      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => {
          const Icon = f.icon;
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted",
              )}
            >
              {Icon && <Icon className="h-3 w-3" />}
              {f.label}
              <span
                className={cn(
                  "tabular-nums",
                  active ? "text-primary-foreground/70" : "text-muted-foreground",
                )}
              >
                {counts[f.key]}
              </span>
            </button>
          );
        })}

        <span className="bg-border mx-1 hidden h-5 w-px sm:block" />

        {/* Minimum-rating filter */}
        <div className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs">
          <span className="text-muted-foreground">Min</span>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`At least ${n} stars`}
              onClick={() => setMinRating(n === minRating ? 0 : n)}
            >
              <Star
                className={cn(
                  "h-3.5 w-3.5 transition-colors",
                  n <= minRating
                    ? "fill-amber-400 text-amber-400"
                    : "fill-transparent text-muted-foreground/40 hover:text-amber-400",
                )}
              />
            </button>
          ))}
        </div>
      </div>

      {valid.length === 0 ? (
        <EmptyState
          icon={Images}
          title="Nothing matches"
          description="No photos match these filters. Try a different filter."
        />
      ) : (
        <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 [&>*]:mb-3">
          {valid.map((p, i) => (
            <button
              key={p._id}
              type="button"
              onClick={() => setIndex(i)}
              className={cn(
                "group relative block w-full cursor-zoom-in overflow-hidden rounded-lg border break-inside-avoid transition-shadow hover:ring-2 hover:ring-primary/40",
                p.approval === "rejected" && "opacity-60",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.imageUrl}
                alt={p.modelLabel ?? ""}
                loading="lazy"
                className="w-full"
              />
              <ReviewBadges
                favorite={p.favorite}
                rating={p.rating}
                approval={p.approval}
                commentCount={p.comments.length}
              />
            </button>
          ))}
        </div>
      )}

      <ImageLightbox
        images={lightboxImages}
        index={index}
        onIndexChange={setIndex}
        onClose={() => setIndex(null)}
        sidebar={
          current ? (
            <ReviewPanel
              generationId={current._id}
              state={{
                favorite: current.favorite,
                rating: current.rating,
                approval: current.approval,
                comments: current.comments,
              }}
            />
          ) : undefined
        }
      />
    </div>
  );
}
