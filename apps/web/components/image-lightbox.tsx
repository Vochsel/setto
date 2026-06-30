"use client";

import { useEffect, type MouseEvent } from "react";
import {
  ChevronLeft,
  ChevronRight,
  X,
  ExternalLink,
  Download,
  Copy,
  Film,
  Trash2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AnimatePopover } from "@/components/animate-popover";
import { VariationsPopover } from "@/components/variations-popover";
import {
  ReviewControls,
  type ReviewStatus,
} from "@/components/review-controls";
import { cn } from "@/lib/utils";
import type { Id } from "@/convex/_generated/dataModel";

// Translucent control button for the dark lightbox scrim, with hover + click
// feedback. Built on the shared Button so focus/disabled states come for free.
const CTRL =
  "size-9 rounded-full bg-white/10 text-white ring-1 ring-white/15 backdrop-blur transition hover:bg-white/20";

export interface LightboxImage {
  url?: string;
  caption?: string;
  /** "video" renders a player; defaults to "image". */
  kind?: "image" | "video";
  /** Poster frame for video items (usually the source image). */
  posterUrl?: string;
  /** Source generation id — when set on an image, enables "Animate". */
  generationId?: string;
  /** Media id (generations / videos / campaignCreatives) — enables review. */
  mediaId?: string;
  rating?: number;
  reviewStatus?: ReviewStatus;
  favorite?: boolean;
}

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed (${res.status})`);
  return await res.blob();
}

/** Re-encode any image blob to PNG (the only type browsers reliably accept on
 * the clipboard). */
async function toPng(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return blob;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const png = await new Promise<Blob | null>((r) =>
    canvas.toBlob(r, "image/png"),
  );
  return png ?? blob;
}

/** File extension for a saved blob, given its MIME type and media kind. */
function extFor(mime: string, kind: "image" | "video"): string {
  const sub = mime.split("/")[1]?.split(";")[0];
  if (sub) return sub.replace("jpeg", "jpg").replace("quicktime", "mov");
  return kind === "video" ? "mp4" : "jpg";
}

/** Touch device whose OS share sheet can take files — i.e. where sharing an
 * image/video offers "Save to Photos" into the camera roll. Desktop (mouse)
 * keeps the plain download instead of popping a share sheet. */
function canSaveToPhotos(files: File[]): boolean {
  return (
    typeof navigator !== "undefined" &&
    (navigator.maxTouchPoints ?? 0) > 0 &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files })
  );
}

/**
 * Save an image/video. On mobile web, hand the file to the OS share sheet so the
 * user can "Save to Photos" straight into their camera roll — a plain
 * `<a download>` lands in Files, not Photos, on iOS. Desktop and anything
 * without file-sharing falls back to a normal download.
 */
async function saveMedia(url: string, kind: "image" | "video") {
  let blob: Blob;
  try {
    blob = await fetchBlob(url);
  } catch {
    window.open(url, "_blank");
    return;
  }
  const name = `setto-${Date.now()}.${extFor(blob.type, kind)}`;
  const file = new File([blob], name, { type: blob.type });

  if (canSaveToPhotos([file])) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      // User dismissed the share sheet — leave it at that, don't also download.
      if (e instanceof DOMException && e.name === "AbortError") return;
      // Anything else (e.g. lost user activation): fall through to a download.
    }
  }

  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

async function copyImage(url: string) {
  try {
    const png = await toPng(await fetchBlob(url));
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": png }),
    ]);
    toast.success("Image copied to clipboard");
  } catch {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Image link copied");
    } catch {
      toast.error("Could not copy");
    }
  }
}

/**
 * Full-screen image viewer with prev/next + keyboard (←/→/Esc) navigation.
 * Controlled by `index` (null = closed).
 */
export function ImageLightbox({
  images,
  index,
  onIndexChange,
  onClose,
  onDelete,
}: {
  images: LightboxImage[];
  index: number | null;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  /** When set, shows a delete control that removes the current item. */
  onDelete?: (image: LightboxImage, index: number) => void;
}) {
  const open = index !== null;
  const current = open ? images[index] : undefined;
  const isVideo = current?.kind === "video";
  const hasPrev = open && index > 0;
  const hasNext = open && index < images.length - 1;

  // Click the dark scrim itself (not the media or any control) to close.
  const onBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && index < images.length - 1) {
        onIndexChange(index + 1);
      } else if (e.key === "ArrowLeft" && index > 0) {
        onIndexChange(index - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, images.length, onIndexChange]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        onClick={onBackdropClick}
        className="flex h-[100dvh] w-screen max-w-none flex-col gap-2 rounded-none border-0 bg-black/90 p-2 ring-0 backdrop-blur-sm sm:max-w-none sm:p-3"
      >
        <DialogTitle className="sr-only">Image preview</DialogTitle>

        <div className="flex items-center justify-between gap-2 px-1">
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs tabular-nums text-white ring-1 ring-white/15 backdrop-blur">
            {open ? index + 1 : 0} / {images.length}
          </span>
          <div className="flex items-center gap-1.5">
            {current?.url && (
              <>
                {!isVideo && current.generationId && (
                  <VariationsPopover
                    generationId={current.generationId as Id<"generations">}
                    align="end"
                    trigger={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={CTRL}
                        title="Generate variations"
                      >
                        <Sparkles className="h-4 w-4" />
                      </Button>
                    }
                  />
                )}
                {!isVideo && current.generationId && (
                  <AnimatePopover
                    generationId={current.generationId as Id<"generations">}
                    align="end"
                    trigger={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={CTRL}
                        title="Animate into video"
                      >
                        <Film className="h-4 w-4" />
                      </Button>
                    }
                  />
                )}
                {!isVideo && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={CTRL}
                    onClick={() => copyImage(current.url!)}
                    title="Copy image"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={CTRL}
                  onClick={() => saveMedia(current.url!, isVideo ? "video" : "image")}
                  title="Save"
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className={CTRL}
                  title="Open original"
                >
                  <a href={current.url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </>
            )}
            {onDelete && open && current && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(CTRL, "hover:bg-red-500/30 hover:text-red-100")}
                onClick={() => onDelete(current, index)}
                title="Delete"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={CTRL}
              onClick={onClose}
              title="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div
          className="relative flex min-h-0 flex-1 items-center justify-center"
          onClick={onBackdropClick}
        >
          {current?.url ? (
            isVideo ? (
              <video
                key={current.url}
                src={current.url}
                poster={current.posterUrl}
                controls
                autoPlay
                loop
                playsInline
                className="max-h-full max-w-full rounded-lg object-contain"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={current.url}
                alt={current.caption ?? ""}
                className="max-h-full max-w-full rounded-lg object-contain"
              />
            )
          ) : null}

          <NavButton
            side="left"
            disabled={!hasPrev}
            onClick={() => hasPrev && onIndexChange(index - 1)}
          />
          <NavButton
            side="right"
            disabled={!hasNext}
            onClick={() => hasNext && onIndexChange(index + 1)}
          />
        </div>

        {current?.mediaId ? (
          <ReviewControls
            key={current.mediaId}
            mediaId={current.mediaId}
            rating={current.rating}
            reviewStatus={current.reviewStatus}
            favorite={current.favorite}
            theme="dark"
            className="mt-1"
          />
        ) : null}

        {current?.caption ? (
          <p className="mt-1 text-center text-xs text-white/80">
            {current.caption}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function NavButton({
  side,
  disabled,
  onClick,
}: {
  side: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === "left" ? "Previous" : "Next"}
      className={cn(
        "absolute top-1/2 size-11 -translate-y-1/2 rounded-full bg-white/10 text-white ring-1 ring-white/15 backdrop-blur transition hover:bg-white/20 disabled:pointer-events-none disabled:opacity-0",
        side === "left" ? "left-2 sm:left-4" : "right-2 sm:right-4",
      )}
    >
      <Icon className="size-6" />
    </Button>
  );
}
