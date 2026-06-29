"use client";

import { useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  X,
  ExternalLink,
  Download,
  Copy,
  Film,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AnimatePopover } from "@/components/animate-popover";
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

async function downloadImage(url: string) {
  try {
    const blob = await fetchBlob(url);
    const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `setto-${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  } catch {
    window.open(url, "_blank");
  }
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
}: {
  images: LightboxImage[];
  index: number | null;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const open = index !== null;
  const current = open ? images[index] : undefined;
  const isVideo = current?.kind === "video";
  const hasPrev = open && index > 0;
  const hasNext = open && index < images.length - 1;

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
                  onClick={() => downloadImage(current.url!)}
                  title="Download"
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

        <div className="relative flex min-h-0 flex-1 items-center justify-center">
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

        {current?.caption ? (
          <p className="mt-2 text-center text-xs text-white/80">
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
