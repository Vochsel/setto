"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Horizontal, scroll-snapping carousel for a shot's generated outputs. Items
 * render large (one mostly-full-width frame on phones, the next peeking) so the
 * imagery reads at a glance, and an optional autoplay walks through them hands-
 * free — handy when reviewing a batch on a phone. Each child is a snap point.
 */
export function OutputCarousel({
  children,
  count,
  className,
  /** Show the autoplay toggle + dots. Off for a single item. */
  controls = true,
}: {
  children: React.ReactNode;
  count: number;
  className?: string;
  controls?: boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);

  // Track the snapped item from scroll position so dots + autoplay stay in
  // sync. Derived from real child offsets, so it's robust to any item width.
  const nearestIndex = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return 0;
    const x = el.scrollLeft;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < el.children.length; i++) {
      const c = el.children[i] as HTMLElement;
      const d = Math.abs(c.offsetLeft - el.offsetLeft - x);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }, []);

  const onScroll = useCallback(() => setActive(nearestIndex()), [nearestIndex]);

  const scrollTo = useCallback((i: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const child = el.children[i] as HTMLElement | undefined;
    child?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  }, []);

  // Autoplay: advance once per interval, wrapping at the end. Pauses when the
  // tab is hidden so it doesn't churn in the background.
  useEffect(() => {
    if (!playing || count <= 1) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      scrollTo((nearestIndex() + 1) % count);
    }, 2200);
    return () => window.clearInterval(id);
  }, [playing, count, nearestIndex, scrollTo]);

  const showControls = controls && count > 1;

  return (
    <div className={cn("group/car relative", className)}>
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="scrollbar-thin -mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth px-1 pb-1"
      >
        {children}
      </div>

      {showControls && (
        <>
          {/* Prev / next — visible on hover (desktop); swipe handles touch. */}
          <button
            type="button"
            aria-label="Previous"
            onClick={() => scrollTo(Math.max(0, active - 1))}
            className="bg-background/80 text-foreground absolute left-1 top-1/2 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full border opacity-0 shadow backdrop-blur transition-opacity group-hover/car:opacity-100 sm:flex"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next"
            onClick={() => scrollTo(Math.min(count - 1, active + 1))}
            className="bg-background/80 text-foreground absolute right-1 top-1/2 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full border opacity-0 shadow backdrop-blur transition-opacity group-hover/car:opacity-100 sm:flex"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <div className="mt-2 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Pause autoplay" : "Play autoplay"}
              className="text-muted-foreground hover:text-foreground flex size-6 items-center justify-center rounded-full border transition-colors"
            >
              {playing ? (
                <Pause className="h-3 w-3" fill="currentColor" />
              ) : (
                <Play className="h-3 w-3 translate-x-px" fill="currentColor" />
              )}
            </button>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: count }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Go to item ${i + 1}`}
                  onClick={() => scrollTo(i)}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === active ? "bg-primary w-4" : "bg-muted-foreground/40 w-1.5",
                  )}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
