"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  restrictToHorizontalAxis,
  restrictToWindowEdges,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2, Sparkles, Play, GripHorizontal } from "lucide-react";
import type { VideoClip } from "@setto/core/video";
import { cn } from "@/lib/utils";
import { formatSeconds } from "@/lib/video-format";

/** Purely presentational card — shared by the in-strip item and the drag overlay. */
function ClipCardVisual({
  clip,
  index,
  selected,
  dragging,
  overlay,
}: {
  clip: VideoClip;
  index: number;
  selected?: boolean;
  dragging?: boolean;
  overlay?: boolean;
}) {
  const isVideo = clip.sourceType === "video";
  const kenBurns = clip.effect?.type === "kenburns";
  const thumb = isVideo ? (clip.posterUrl ?? clip.url) : clip.url;

  return (
    <div
      className={cn(
        "bg-card relative w-28 shrink-0 overflow-hidden rounded-xl border transition-all",
        selected
          ? "border-primary ring-primary/60 ring-2"
          : "hover:border-foreground/25",
        overlay && "border-primary rotate-[-3deg] scale-105 shadow-2xl",
        dragging && !overlay && "opacity-40",
      )}
    >
      <div className="bg-muted relative aspect-[9/16] w-full overflow-hidden">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            draggable={false}
            className="h-full w-full object-cover"
          />
        ) : null}

        {/* Top gradient + index / drag affordance. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/55 to-transparent p-1.5">
          <span className="rounded bg-black/45 px-1.5 text-[10px] font-semibold text-white tabular-nums backdrop-blur-sm">
            {index + 1}
          </span>
          <GripHorizontal className="h-3.5 w-3.5 text-white/70" />
        </div>

        {/* Bottom row: duration + effect / video badges. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/60 to-transparent p-1.5">
          <span className="rounded bg-black/45 px-1.5 text-[10px] font-medium text-white tabular-nums backdrop-blur-sm">
            {formatSeconds(clip.durationMs)}
          </span>
          <span className="flex items-center gap-1">
            {kenBurns ? (
              <span className="flex size-4 items-center justify-center rounded bg-black/45 text-white backdrop-blur-sm">
                <Sparkles className="h-2.5 w-2.5" />
              </span>
            ) : null}
            {isVideo ? (
              <span className="flex size-4 items-center justify-center rounded bg-black/45 text-white backdrop-blur-sm">
                <Play className="h-2.5 w-2.5" fill="currentColor" />
              </span>
            ) : null}
          </span>
        </div>
      </div>
    </div>
  );
}

function SortableClipCard({
  clip,
  index,
  selected,
  onSelect,
  onDelete,
}: {
  clip: VideoClip;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: clip.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="group/card relative"
    >
      <button
        type="button"
        onClick={onSelect}
        {...attributes}
        {...listeners}
        aria-label={`Clip ${index + 1}`}
        className="cursor-grab touch-none active:cursor-grabbing"
      >
        <ClipCardVisual
          clip={clip}
          index={index}
          selected={selected}
          dragging={isDragging}
        />
      </button>

      {/* Delete — appears on hover, never starts a drag. */}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label="Delete clip"
        className="bg-background/90 text-muted-foreground hover:text-destructive absolute right-1.5 top-1.5 z-10 flex size-6 items-center justify-center rounded-full border opacity-0 shadow-sm backdrop-blur transition group-hover/card:opacity-100"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

export function ClipStrip({
  clips,
  selectedId,
  onSelect,
  onReorder,
  onDelete,
}: {
  clips: VideoClip[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (clips: VideoClip[]) => void;
  onDelete: (id: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const activeIndex = clips.findIndex((c) => c.id === activeId);
  const activeClip = activeIndex >= 0 ? clips[activeIndex] : null;

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }
  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = clips.findIndex((c) => c.id === active.id);
    const newIndex = clips.findIndex((c) => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(clips, oldIndex, newIndex));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToHorizontalAxis, restrictToWindowEdges]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext
        items={clips.map((c) => c.id)}
        strategy={horizontalListSortingStrategy}
      >
        <div className="group/strip flex gap-2.5 overflow-x-auto pb-2">
          {clips.map((clip, i) => (
            <SortableClipCard
              key={clip.id}
              clip={clip}
              index={i}
              selected={selectedId === clip.id}
              onSelect={() => onSelect(clip.id)}
              onDelete={() => onDelete(clip.id)}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay dropAnimation={{ duration: 200 }}>
        {activeClip ? (
          <ClipCardVisual
            clip={activeClip}
            index={activeIndex}
            selected
            overlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
