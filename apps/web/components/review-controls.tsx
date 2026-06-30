"use client";

import { useMutation } from "convex/react";
import { Star, Heart, Check, X, AlertTriangle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export type ReviewStatus = "approved" | "rejected" | "needs_changes";

export interface MediaReview {
  rating?: number;
  reviewStatus?: ReviewStatus;
  favorite?: boolean;
}

export const REVIEW_STATUSES: {
  value: ReviewStatus;
  label: string;
  dot: string;
  active: string;
  icon: typeof Check;
}[] = [
  {
    value: "approved",
    label: "Approved",
    dot: "bg-emerald-500",
    active: "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30",
    icon: Check,
  },
  {
    value: "needs_changes",
    label: "Needs changes",
    dot: "bg-amber-500",
    active: "bg-amber-500/15 text-amber-600 ring-amber-500/30",
    icon: AlertTriangle,
  },
  {
    value: "rejected",
    label: "Rejected",
    dot: "bg-red-500",
    active: "bg-red-500/15 text-red-600 ring-red-500/30",
    icon: X,
  },
];

export function statusMeta(status?: ReviewStatus) {
  return REVIEW_STATUSES.find((s) => s.value === status);
}

// The review mutations accept a union of the three media id types; the concrete
// id is validated at runtime, so casting to one member is safe.
type AnyMediaId = Id<"generations">;
const asId = (id: string) => id as AnyMediaId;

/* ───────────────────────────── Stars ───────────────────────────── */

function Stars({
  value,
  onRate,
  theme,
}: {
  value: number;
  onRate: (n: number) => void;
  theme: "light" | "dark";
}) {
  return (
    <div className="flex items-center">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        return (
          <button
            key={n}
            type="button"
            title={`${n} star${n > 1 ? "s" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              // Click the current rating again to clear it.
              onRate(n === value ? 0 : n);
            }}
            className={cn(
              "p-0.5 transition",
              theme === "dark"
                ? "text-white/40 hover:text-white"
                : "text-muted-foreground/40 hover:text-amber-500",
              filled && "text-amber-400",
            )}
          >
            <Star className="h-4 w-4" fill={filled ? "currentColor" : "none"} />
          </button>
        );
      })}
    </div>
  );
}

/* ───────────────────────── Favorite button ─────────────────────── */

export function FavoriteButton({
  mediaId,
  favorite,
  theme = "light",
  className,
}: {
  mediaId: string;
  favorite?: boolean;
  theme?: "light" | "dark";
  className?: string;
}) {
  const toggleFavorite = useMutation(api.review.toggleFavorite);
  return (
    <button
      type="button"
      title={favorite ? "Unfavorite" : "Favorite"}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        toggleFavorite({ id: asId(mediaId) }).catch(() => {});
      }}
      className={cn(
        "flex size-7 items-center justify-center rounded-full backdrop-blur transition",
        theme === "dark"
          ? "bg-white/10 ring-1 ring-white/15 hover:bg-white/20"
          : "bg-black/40 ring-1 ring-white/15 hover:bg-black/55",
        className,
      )}
    >
      <Heart
        className={cn(
          "h-4 w-4 transition",
          favorite ? "text-red-500" : "text-white",
        )}
        fill={favorite ? "currentColor" : "none"}
      />
    </button>
  );
}

/* ─────────────────────────── Status ────────────────────────────── */

function StatusButtons({
  value,
  onSet,
  theme,
}: {
  value?: ReviewStatus;
  onSet: (s: ReviewStatus | null) => void;
  theme: "light" | "dark";
}) {
  return (
    <div className="flex items-center gap-1">
      {REVIEW_STATUSES.map((s) => {
        const Icon = s.icon;
        const active = value === s.value;
        return (
          <button
            key={s.value}
            type="button"
            title={s.label}
            onClick={(e) => {
              e.stopPropagation();
              onSet(active ? null : s.value);
            }}
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ring-1 transition",
              active
                ? s.active
                : theme === "dark"
                  ? "text-white/60 ring-white/15 hover:bg-white/10"
                  : "text-muted-foreground ring-border hover:bg-muted",
            )}
          >
            <Icon className="h-3 w-3" />
            <span className="hidden sm:inline">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────── Composed controls ─────────────────────── */

/** Full review bar: stars + favorite + status. Used in the lightbox. */
export function ReviewControls({
  mediaId,
  rating,
  reviewStatus,
  favorite,
  theme = "light",
  className,
}: {
  mediaId: string;
  className?: string;
} & MediaReview & { theme?: "light" | "dark" }) {
  const setReview = useMutation(api.review.setReview);
  const toggleFavorite = useMutation(api.review.toggleFavorite);
  const id = asId(mediaId);

  return (
    <div
      className={cn("flex flex-wrap items-center justify-center gap-2", className)}
      onClick={(e) => e.stopPropagation()}
    >
      <Stars
        value={rating ?? 0}
        theme={theme}
        onRate={(n) =>
          setReview({ id, rating: n === 0 ? null : n }).catch(() => {})
        }
      />
      <button
        type="button"
        title={favorite ? "Unfavorite" : "Favorite"}
        onClick={() => toggleFavorite({ id }).catch(() => {})}
        className={cn(
          "flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ring-1 transition",
          favorite
            ? "bg-red-500/15 text-red-500 ring-red-500/30"
            : theme === "dark"
              ? "text-white/60 ring-white/15 hover:bg-white/10"
              : "text-muted-foreground ring-border hover:bg-muted",
        )}
      >
        <Heart className="h-3 w-3" fill={favorite ? "currentColor" : "none"} />
        Favorite
      </button>
      <StatusButtons
        value={reviewStatus}
        theme={theme}
        onSet={(s) => setReview({ id, reviewStatus: s }).catch(() => {})}
      />
    </div>
  );
}

/** Compact read-only indicators (rating + status dot) for tile overlays. */
export function ReviewBadges({
  rating,
  reviewStatus,
  className,
}: MediaReview & { className?: string }) {
  const status = statusMeta(reviewStatus);
  if (!rating && !status) return null;
  return (
    <div
      className={cn(
        "pointer-events-none flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white ring-1 ring-white/15 backdrop-blur",
        className,
      )}
    >
      {rating ? (
        <span className="flex items-center gap-0.5">
          <Star className="h-2.5 w-2.5 text-amber-400" fill="currentColor" />
          {rating}
        </span>
      ) : null}
      {status ? <span className={cn("size-2 rounded-full", status.dot)} /> : null}
    </div>
  );
}
