"use client";

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, Sparkles, Play } from "lucide-react";
import type { VideoClip } from "@setto/core/video";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { formatSeconds } from "@/lib/video-format";

function ClipCard({
  clip,
  index,
  selected,
  onSelect,
  onRetime,
  onDelete,
  onToggleKenBurns,
}: {
  clip: VideoClip;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onRetime: (ms: number) => void;
  onDelete: () => void;
  onToggleKenBurns: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: clip.id });
  const isVideo = clip.sourceType === "video";
  const kenBurns = clip.effect?.type === "kenburns";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "bg-card relative w-32 shrink-0 rounded-lg border",
        selected && "ring-foreground/40 ring-2",
        isDragging && "z-10 opacity-80 shadow-lg",
      )}
    >
      <button
        onClick={onSelect}
        className="bg-muted relative block aspect-[9/16] w-full overflow-hidden rounded-t-lg"
      >
        {clip.posterUrl || clip.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={isVideo ? (clip.posterUrl ?? clip.url) : clip.url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : null}
        <span className="absolute top-1 left-1 rounded bg-black/60 px-1 text-[10px] font-medium text-white">
          {index + 1}
        </span>
        {isVideo ? (
          <span className="absolute right-1 bottom-1 rounded bg-black/60 p-0.5 text-white">
            <Play className="h-3 w-3" />
          </span>
        ) : null}
      </button>

      <div className="space-y-1.5 p-1.5">
        <div className="flex items-center justify-between">
          <button
            {...attributes}
            {...listeners}
            className="text-muted-foreground hover:text-foreground cursor-grab touch-none active:cursor-grabbing"
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <span className="text-muted-foreground text-[11px] tabular-nums">
            {formatSeconds(clip.durationMs)}
          </span>
          <button
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive"
            aria-label="Delete clip"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <Slider
          value={[clip.durationMs]}
          min={300}
          max={10000}
          step={100}
          onValueChange={([v]) => onRetime(v)}
          aria-label="Clip duration"
        />

        {!isVideo ? (
          <Button
            variant={kenBurns ? "secondary" : "ghost"}
            size="sm"
            className="h-6 w-full text-[11px]"
            onClick={onToggleKenBurns}
          >
            <Sparkles className="h-3 w-3" /> Ken Burns
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function ClipStrip({
  clips,
  selectedId,
  onSelect,
  onReorder,
  onRetime,
  onDelete,
  onToggleKenBurns,
}: {
  clips: VideoClip[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (clips: VideoClip[]) => void;
  onRetime: (id: string, ms: number) => void;
  onDelete: (id: string) => void;
  onToggleKenBurns: (id: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function handleDragEnd(e: DragEndEvent) {
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
      modifiers={[restrictToHorizontalAxis]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={clips.map((c) => c.id)}
        strategy={horizontalListSortingStrategy}
      >
        <div className="flex gap-2 overflow-x-auto pb-2">
          {clips.map((clip, i) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              index={i}
              selected={selectedId === clip.id}
              onSelect={() => onSelect(clip.id)}
              onRetime={(ms) => onRetime(clip.id, ms)}
              onDelete={() => onDelete(clip.id)}
              onToggleKenBurns={() => onToggleKenBurns(clip.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
