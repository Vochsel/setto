"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  ListChecks,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  ImageOff,
  Play,
  ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getImageModel } from "@/convex/lib/imageModels";
import { getVideoModel } from "@/convex/lib/videoModels";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

type GenStatus = "queued" | "generating" | "succeeded" | "failed";

interface QueueItem {
  kind: "image" | "video";
  _id: string;
  _creationTime: number;
  status: GenStatus;
  thumbUrl?: string;
  videoUrl?: string;
  modelKey: string;
  modelLabel?: string;
  prompt: string;
  progress?: number;
  progressLabel?: string;
  error?: string;
  shootId: string;
  shotId: string;
}

const statusMeta: Record<GenStatus, { label: string; className: string }> = {
  queued: {
    label: "Queued",
    className:
      "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  generating: {
    label: "Generating",
    className: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
  succeeded: {
    label: "Succeeded",
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  failed: {
    label: "Failed",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
};

const PAGE = 30;

export default function QueuePage() {
  const router = useRouter();
  // Two reactive, accumulating feeds (images + videos) merged client-side.
  const gens = usePaginatedQuery(
    api.generations.queueFeed,
    {},
    { initialNumItems: PAGE },
  );
  const vids = usePaginatedQuery(
    api.videos.queueFeed,
    {},
    { initialNumItems: PAGE },
  );

  const genResults = gens.results as QueueItem[];
  const vidResults = vids.results as QueueItem[];

  // Merge by time. To avoid items jumping as more loads, only show down to the
  // shared frontier: the more-recent of each non-exhausted feed's oldest item.
  // An exhausted feed imposes no frontier (we already have all of it).
  const items = useMemo(() => {
    const tail = (results: QueueItem[], status: string): number => {
      if (status === "Exhausted") return -Infinity;
      if (results.length === 0) return Infinity;
      return results[results.length - 1]._creationTime;
    };
    const frontier = Math.max(
      tail(genResults, gens.status),
      tail(vidResults, vids.status),
    );
    return [...genResults, ...vidResults]
      .filter((it) => it._creationTime >= frontier)
      .sort((a, b) => b._creationTime - a._creationTime);
  }, [genResults, vidResults, gens.status, vids.status]);

  const isDone = gens.status === "Exhausted" && vids.status === "Exhausted";
  const loadingFirst =
    items.length === 0 &&
    (gens.status === "LoadingFirstPage" ||
      vids.status === "LoadingFirstPage");
  const loadingMore =
    gens.status === "LoadingMore" || vids.status === "LoadingMore";
  const genCan = gens.status === "CanLoadMore";
  const vidCan = vids.status === "CanLoadMore";
  const canLoadMore = genCan || vidCan;
  const loadMoreGen = gens.loadMore;
  const loadMoreVid = vids.loadMore;

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !canLoadMore) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        if (genCan) loadMoreGen(PAGE);
        if (vidCan) loadMoreVid(PAGE);
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [canLoadMore, genCan, vidCan, loadMoreGen, loadMoreVid]);

  return (
    <>
      <PageHeader
        title="Queue"
        description="Every image & video generation across the workspace, newest first"
      />

      <div className="space-y-3 p-4 md:p-6">
        {loadingFirst ? (
          Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))
        ) : items.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Nothing in the queue yet"
            description="Generate images or animate them into videos — every job (queued, running, done or failed) streams in here, newest first."
          />
        ) : (
          <>
            {items.map((it) => (
              <QueueRow
                key={it._id}
                item={it}
                onOpen={() =>
                  router.push(`/shoots/${it.shootId}?shot=${it.shotId}`)
                }
              />
            ))}

            <div ref={sentinel} className="flex justify-center py-4">
              {loadingMore ? (
                <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
              ) : isDone ? (
                <span className="text-muted-foreground text-xs">
                  That’s everything · {items.length} generation
                  {items.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function QueueRow({
  item,
  onOpen,
}: {
  item: QueueItem;
  onOpen: () => void;
}) {
  const meta = statusMeta[item.status];
  const modelName =
    item.modelLabel ??
    getImageModel(item.modelKey)?.label ??
    getVideoModel(item.modelKey)?.label ??
    item.modelKey;
  const inFlight = item.status === "queued" || item.status === "generating";
  const showThumb = item.status === "succeeded" && item.thumbUrl;

  return (
    <Card
      onClick={onOpen}
      title="Open source shot"
      className="hover:bg-muted/40 flex cursor-pointer flex-row items-center gap-3 p-3 transition-colors"
    >
      {/* Thumbnail / status icon */}
      <div className="bg-muted relative aspect-[3/4] h-20 shrink-0 overflow-hidden rounded-md border">
        {showThumb ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.thumbUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
            {item.kind === "video" ? (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex size-6 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/20 backdrop-blur">
                  <Play className="h-3 w-3 translate-x-px" fill="currentColor" />
                </span>
              </span>
            ) : null}
          </>
        ) : item.status === "failed" ? (
          <div className="text-destructive flex h-full w-full items-center justify-center">
            <ImageOff className="h-5 w-5" />
          </div>
        ) : (
          <div className="text-muted-foreground flex h-full w-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
      </div>

      {/* Details */}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="shrink-0 text-[10px] uppercase tracking-wide"
          >
            {item.kind}
          </Badge>
          <span className="truncate text-sm font-medium">{modelName}</span>
          <span className="text-muted-foreground shrink-0 text-xs">
            {formatRelative(item._creationTime)}
          </span>
        </div>
        <p className="text-muted-foreground line-clamp-2 text-xs">
          {item.prompt}
        </p>
        {inFlight && item.progressLabel ? (
          <div className="flex items-center gap-2 pt-0.5">
            <span className="text-muted-foreground text-[11px]">
              {item.progressLabel}
            </span>
            {typeof item.progress === "number" ? (
              <div className="bg-muted h-1 w-24 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full transition-all"
                  style={{ width: `${Math.round(item.progress * 100)}%` }}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Status + affordance */}
      <div className="flex shrink-0 items-center gap-2">
        {item.status === "failed" && item.error ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className={cn("gap-1", meta.className)}>
                <AlertCircle className="h-3 w-3" /> {meta.label}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-60">{item.error}</TooltipContent>
          </Tooltip>
        ) : (
          <Badge variant="outline" className={cn("gap-1", meta.className)}>
            <StatusIcon status={item.status} /> {meta.label}
          </Badge>
        )}
        <ChevronRight className="text-muted-foreground h-4 w-4" />
      </div>
    </Card>
  );
}

function StatusIcon({ status }: { status: GenStatus }) {
  if (status === "succeeded") return <CheckCircle2 className="h-3 w-3" />;
  if (status === "queued") return <Clock className="h-3 w-3" />;
  if (status === "generating")
    return <Loader2 className="h-3 w-3 animate-spin" />;
  return <AlertCircle className="h-3 w-3" />;
}
