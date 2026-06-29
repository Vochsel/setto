"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Star, Heart, Check, X, Trash2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/format";
import type { Id } from "@/convex/_generated/dataModel";
import type { Approval, ReviewComment } from "@/components/shoot/types";

export interface ReviewState {
  favorite: boolean;
  rating: number;
  approval: Approval;
  comments: ReviewComment[];
}

/** Interactive 0–5 star rating. Clicking the current rating clears it. */
export function StarRating({
  value,
  onChange,
  size = 4,
  className,
}: {
  value: number;
  onChange?: (rating: number) => void;
  size?: number;
  className?: string;
}) {
  const [hover, setHover] = useState(0);
  const readOnly = !onChange;
  const shown = hover || value;
  return (
    <div
      className={cn("flex items-center gap-0.5", className)}
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          onMouseEnter={() => !readOnly && setHover(n)}
          onClick={() => onChange?.(n === value ? 0 : n)}
          className={cn(
            "transition-transform",
            !readOnly && "cursor-pointer hover:scale-110",
          )}
        >
          <Star
            className={cn(
              n <= shown
                ? "fill-amber-400 text-amber-400"
                : "fill-transparent text-muted-foreground/40",
            )}
            style={{ width: `${size * 0.25}rem`, height: `${size * 0.25}rem` }}
          />
        </button>
      ))}
    </div>
  );
}

/** Compact read-only status badges drawn over a gallery tile. */
export function ReviewBadges({
  favorite,
  rating,
  approval,
  commentCount,
}: {
  favorite: boolean;
  rating: number;
  approval: Approval;
  commentCount: number;
}) {
  return (
    <>
      {approval && (
        <span
          className={cn(
            "absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm",
            approval === "approved" ? "bg-emerald-600" : "bg-rose-600",
          )}
        >
          {approval === "approved" ? (
            <Check className="h-2.5 w-2.5" />
          ) : (
            <X className="h-2.5 w-2.5" />
          )}
          {approval === "approved" ? "Approved" : "Rejected"}
        </span>
      )}
      {favorite && (
        <Heart className="absolute right-1.5 top-1.5 h-4 w-4 fill-rose-500 text-rose-500 drop-shadow" />
      )}
      {(rating > 0 || commentCount > 0) && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4 text-[10px] text-white">
          {rating > 0 ? (
            <span className="flex items-center gap-0.5">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {rating}
            </span>
          ) : (
            <span />
          )}
          {commentCount > 0 ? <span>💬 {commentCount}</span> : <span />}
        </div>
      )}
    </>
  );
}

/**
 * Full review panel for a single generated image: favorite, 0–5 rating,
 * approve/reject and a threaded comment list. Mutations write straight to
 * Convex so every surface that embeds this stays in sync.
 */
export function ReviewPanel({
  generationId,
  state,
  className,
}: {
  generationId: Id<"generations">;
  state: ReviewState;
  className?: string;
}) {
  const setRating = useMutation(api.generations.setRating);
  const setFavorite = useMutation(api.generations.setFavorite);
  const setApproval = useMutation(api.generations.setApproval);
  const addComment = useMutation(api.generations.addComment);
  const removeComment = useMutation(api.generations.removeComment);

  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  async function postComment() {
    const text = draft.trim();
    if (!text) return;
    setPosting(true);
    try {
      await addComment({ id: generationId, text });
      setDraft("");
    } catch {
      toast.error("Could not post comment");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-4 text-sm", className)}>
      {/* Favorite + approval */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={state.favorite}
          onClick={() =>
            setFavorite({ id: generationId, favorite: !state.favorite })
          }
          className={cn(
            state.favorite && "border-rose-300 bg-rose-50 text-rose-600",
          )}
        >
          <Heart
            className={cn("h-4 w-4", state.favorite && "fill-rose-500")}
          />
          {state.favorite ? "Favorited" : "Favorite"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={state.approval === "approved"}
          onClick={() =>
            setApproval({
              id: generationId,
              approval: state.approval === "approved" ? null : "approved",
            })
          }
          className={cn(
            state.approval === "approved" &&
              "border-emerald-300 bg-emerald-50 text-emerald-700",
          )}
        >
          <Check className="h-4 w-4" /> Approve
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={state.approval === "rejected"}
          onClick={() =>
            setApproval({
              id: generationId,
              approval: state.approval === "rejected" ? null : "rejected",
            })
          }
          className={cn(
            state.approval === "rejected" &&
              "border-rose-300 bg-rose-50 text-rose-600",
          )}
        >
          <X className="h-4 w-4" /> Reject
        </Button>
      </div>

      {/* Rating */}
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs font-medium">Rating</span>
        <StarRating
          value={state.rating}
          size={5}
          onChange={(rating) => setRating({ id: generationId, rating })}
        />
      </div>

      {/* Comments */}
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs font-medium">
          Comments{" "}
          {state.comments.length > 0 && (
            <span className="text-muted-foreground/60">
              ({state.comments.length})
            </span>
          )}
        </span>

        <div className="flex flex-col gap-2">
          {state.comments.length === 0 && (
            <p className="text-muted-foreground/70 text-xs italic">
              No comments yet.
            </p>
          )}
          {state.comments
            .slice()
            .sort((a, b) => a.createdAt - b.createdAt)
            .map((c) => (
              <div
                key={c.id}
                className="group bg-muted/50 relative rounded-md p-2 pr-7"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium">
                    {c.authorName ?? "Someone"}
                  </span>
                  <span className="text-muted-foreground/70 text-[10px]">
                    {formatRelative(c.createdAt)}
                  </span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed">
                  {c.text}
                </p>
                <button
                  type="button"
                  aria-label="Delete comment"
                  onClick={() =>
                    removeComment({ id: generationId, commentId: c.id })
                  }
                  className="text-muted-foreground hover:text-destructive absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
        </div>

        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                postComment();
              }
            }}
            placeholder="Add a comment…"
            className="min-h-[38px] flex-1 text-sm"
          />
          <Button
            type="button"
            size="icon"
            className="size-9 shrink-0"
            disabled={posting || !draft.trim()}
            onClick={postComment}
            title="Post comment (⌘↵)"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
