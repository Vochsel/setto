"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Film,
  Send,
  Plug,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import {
  DEFAULT_TZ,
  dayKey,
  formatTime,
  tzAbbrev,
  zonedToEpoch,
} from "@/lib/timezone";
import {
  PostDialog,
  type SocialChannel,
  type SocialPost,
} from "@/components/social/post-dialog";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Days (as YYYY-MM-DD in tz) for the month grid containing `cursor`. */
function monthGrid(cursor: Date): { key: string; inMonth: boolean; label: number }[] {
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const first = new Date(y, m, 1);
  // Monday-first offset.
  const startOffset = (first.getDay() + 6) % 7;
  const start = new Date(y, m, 1 - startOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { key, inMonth: d.getMonth() === m, label: d.getDate() };
  });
}

export default function SocialPage() {
  const posts = useQuery(api.social.posts, {}) as SocialPost[] | undefined;
  const connections = useQuery(api.integrations.list, {});
  const settings = useQuery(api.settings.get, {});
  const loadChannels = useAction(api.socialNode.channels);

  const tz = settings?.timezone ?? DEFAULT_TZ;
  const buffer = connections?.find((c) => c.provider === "buffer");

  const [channels, setChannels] = useState<SocialChannel[]>([]);
  const [cursor, setCursor] = useState(() => new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SocialPost | null>(null);
  const [newAt, setNewAt] = useState<number | undefined>(undefined);

  // Pull Buffer channels once connected (for the picker).
  useEffect(() => {
    if (buffer?.status === "connected") {
      loadChannels({})
        .then((c) => setChannels(c as SocialChannel[]))
        .catch(() => {});
    }
  }, [buffer?.status, loadChannels]);

  const grid = useMemo(() => monthGrid(cursor), [cursor]);
  const byDay = useMemo(() => {
    const map = new Map<string, SocialPost[]>();
    for (const p of posts ?? []) {
      if (!p.scheduledAt) continue;
      const key = dayKey(p.scheduledAt, tz);
      (map.get(key) ?? map.set(key, []).get(key)!).push(p);
    }
    for (const list of map.values())
      list.sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0));
    return map;
  }, [posts, tz]);

  const drafts = (posts ?? []).filter((p) => !p.scheduledAt && p.status !== "sent");

  function openNew(at?: number) {
    setEditing(null);
    setNewAt(at);
    setDialogOpen(true);
  }
  function openEdit(p: SocialPost) {
    setEditing(p);
    setNewAt(undefined);
    setDialogOpen(true);
  }

  const monthLabel = cursor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <PageHeader
        title="Social"
        description={`Plan & schedule posts · ${tzAbbrev(tz)}`}
      >
        <Button onClick={() => openNew()}>
          <Plus className="mr-2 h-4 w-4" /> New post
        </Button>
      </PageHeader>

      <div className="space-y-4 p-4 md:p-6">
        {connections && !buffer && (
          <div className="bg-muted/40 flex items-center gap-3 rounded-lg border border-dashed px-4 py-3 text-sm">
            <Plug className="text-muted-foreground h-4 w-4 shrink-0" />
            <span className="flex-1">
              Connect Buffer to publish to Instagram and other channels. You can
              still plan posts on the calendar.
            </span>
            <Button asChild size="sm" variant="outline">
              <Link href="/settings">Connect</Link>
            </Button>
          </div>
        )}

        {/* Month nav */}
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">{monthLabel}</div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))
              }
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Calendar */}
        <div className="overflow-hidden rounded-lg border">
          <div className="grid grid-cols-7 border-b">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="text-muted-foreground px-2 py-1.5 text-center text-xs font-medium"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((cell) => {
              const dayPosts = byDay.get(cell.key) ?? [];
              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => {
                    // Default new posts to 9am on the clicked day, in the workspace tz.
                    openNew(zonedToEpoch(cell.key, "09:00", tz));
                  }}
                  className={cn(
                    "hover:bg-muted/50 min-h-[92px] border-b border-r p-1.5 text-left align-top transition",
                    !cell.inMonth && "bg-muted/20 text-muted-foreground",
                  )}
                >
                  <div className="mb-1 text-xs font-medium">{cell.label}</div>
                  <div className="space-y-1">
                    {dayPosts.slice(0, 3).map((p) => (
                      <div
                        key={p._id}
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(p);
                        }}
                        className={cn(
                          "flex items-center gap-1 rounded px-1 py-0.5 text-[11px]",
                          p.status === "sent"
                            ? "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400"
                            : p.status === "error"
                              ? "bg-destructive/15 text-destructive"
                              : "bg-primary/10 text-primary",
                        )}
                      >
                        {p.media[0]?.thumbnailUrl || p.media[0]?.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.media[0].thumbnailUrl ?? p.media[0].url}
                            alt=""
                            className="h-4 w-4 shrink-0 rounded object-cover"
                          />
                        ) : p.media[0]?.type === "video" ? (
                          <Film className="h-3 w-3 shrink-0" />
                        ) : (
                          <Send className="h-3 w-3 shrink-0" />
                        )}
                        <span className="truncate">
                          {p.scheduledAt && formatTime(p.scheduledAt, tz)}{" "}
                          {p.text || "Post"}
                        </span>
                      </div>
                    ))}
                    {dayPosts.length > 3 && (
                      <div className="text-muted-foreground text-[11px]">
                        +{dayPosts.length - 3} more
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Drafts */}
        {drafts.length > 0 && (
          <div>
            <div className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
              Drafts
            </div>
            <div className="flex flex-wrap gap-2">
              {drafts.map((p) => (
                <button
                  key={p._id}
                  type="button"
                  onClick={() => openEdit(p)}
                  className="hover:bg-muted flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  {p.media[0]?.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.media[0].thumbnailUrl ?? p.media[0].url}
                      alt=""
                      className="h-8 w-8 rounded object-cover"
                    />
                  )}
                  <span className="max-w-[12rem] truncate">
                    {p.text || "Untitled post"}
                  </span>
                  <Badge variant="secondary">{p.media.length} media</Badge>
                </button>
              ))}
            </div>
          </div>
        )}

        {posts && posts.length === 0 && drafts.length === 0 && (
          <EmptyState
            icon={Send}
            title="Plan your first post"
            description="Build a post from your shoot images and videos, schedule it, and it shows up here."
            action={<Button onClick={() => openNew()}>New post</Button>}
          />
        )}
      </div>

      <PostDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        post={editing}
        timezone={tz}
        channels={channels}
        initialScheduledAt={newAt}
      />
    </>
  );
}
