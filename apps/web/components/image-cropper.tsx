"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { X, Loader2, Crop as CropIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Rect = { x: number; y: number; w: number; h: number };
type Handle = "move" | "nw" | "ne" | "sw" | "se";

const MIN = 0.05; // smallest crop, as a fraction of the image
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * A free-form crop overlay. Renders the image with a draggable / resizable crop
 * box (rule-of-thirds guides + corner handles). On Apply it fetches the source
 * bytes, crops to the selected region on a canvas, and hands back a Blob.
 */
export function ImageCropper({
  src,
  busy = false,
  onCancel,
  onApply,
}: {
  src: string;
  busy?: boolean;
  onCancel: () => void;
  onApply: (blob: Blob) => void | Promise<void>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<Rect>({ x: 0.08, y: 0.08, w: 0.84, h: 0.84 });
  const drag = useRef<{
    handle: Handle;
    start: Rect;
    ptr: { x: number; y: number };
  } | null>(null);

  function frac(e: PointerEvent | ReactPointerEvent) {
    const wrap = wrapRef.current;
    if (!wrap) return { x: 0, y: 0 };
    const b = wrap.getBoundingClientRect();
    return {
      x: clamp01((e.clientX - b.left) / b.width),
      y: clamp01((e.clientY - b.top) / b.height),
    };
  }

  function onMove(e: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const p = frac(e);
    if (d.handle === "move") {
      const dx = p.x - d.ptr.x;
      const dy = p.y - d.ptr.y;
      const x = Math.max(0, Math.min(d.start.x + dx, 1 - d.start.w));
      const y = Math.max(0, Math.min(d.start.y + dy, 1 - d.start.h));
      setRect({ ...d.start, x, y });
      return;
    }
    let left = d.start.x;
    let top = d.start.y;
    let right = d.start.x + d.start.w;
    let bottom = d.start.y + d.start.h;
    if (d.handle.includes("w")) left = clamp01(Math.min(p.x, right - MIN));
    if (d.handle.includes("e")) right = clamp01(Math.max(p.x, left + MIN));
    if (d.handle.includes("n")) top = clamp01(Math.min(p.y, bottom - MIN));
    if (d.handle.includes("s")) bottom = clamp01(Math.max(p.y, top + MIN));
    setRect({ x: left, y: top, w: right - left, h: bottom - top });
  }

  function endDrag() {
    drag.current = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", endDrag);
  }

  function startDrag(e: ReactPointerEvent, handle: Handle) {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { handle, start: rect, ptr: frac(e) };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", endDrag);
  }

  async function apply() {
    const res = await fetch(src);
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    const sx = Math.round(rect.x * bmp.width);
    const sy = Math.round(rect.y * bmp.height);
    const sw = Math.max(1, Math.round(rect.w * bmp.width));
    const sh = Math.max(1, Math.round(rect.h * bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bmp.close();
      return;
    }
    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, sw, sh);
    bmp.close();
    const type =
      blob.type === "image/png" || blob.type === "image/webp"
        ? blob.type
        : "image/jpeg";
    const out = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, type, 0.95),
    );
    if (out) await onApply(out);
  }

  const pct = (n: number) => `${n * 100}%`;

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        ref={wrapRef}
        className="relative inline-block max-w-full touch-none select-none"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          draggable={false}
          className="block max-h-[calc(100dvh-9rem)] max-w-full object-contain"
        />

        <div
          onPointerDown={(e) => startDrag(e, "move")}
          className="absolute cursor-move border border-white/90"
          style={{
            left: pct(rect.x),
            top: pct(rect.y),
            width: pct(rect.w),
            height: pct(rect.h),
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
          }}
        >
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-y-0 left-1/3 w-px bg-white/30" />
            <div className="absolute inset-y-0 left-2/3 w-px bg-white/30" />
            <div className="absolute inset-x-0 top-1/3 h-px bg-white/30" />
            <div className="absolute inset-x-0 top-2/3 h-px bg-white/30" />
          </div>
          {(["nw", "ne", "sw", "se"] as Handle[]).map((h) => (
            <span
              key={h}
              onPointerDown={(e) => startDrag(e, h)}
              className={cornerClass(h)}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          <X className="h-4 w-4" /> Cancel
        </Button>
        <Button onClick={apply} disabled={busy}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CropIcon className="h-4 w-4" />
          )}
          Apply crop
        </Button>
      </div>
    </div>
  );
}

function cornerClass(h: Handle): string {
  const base =
    "absolute size-4 rounded-full bg-white shadow ring-2 ring-black/40";
  const pos: Record<Exclude<Handle, "move">, string> = {
    nw: "-left-2 -top-2 cursor-nwse-resize",
    ne: "-right-2 -top-2 cursor-nesw-resize",
    sw: "-left-2 -bottom-2 cursor-nesw-resize",
    se: "-right-2 -bottom-2 cursor-nwse-resize",
  };
  return cn(base, pos[h as Exclude<Handle, "move">]);
}
