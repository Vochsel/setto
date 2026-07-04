"use client";

import { useEffect, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  X,
  Film,
  Send,
  Trash2,
  AtSign,
  CalendarClock,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Id } from "@/convex/_generated/dataModel";
import { MediaPicker, type PickedMedia } from "./media-picker";
import { zonedToEpoch, epochToInputs, tzAbbrev } from "@/lib/timezone";

export type SocialChannel = {
  id: string;
  name?: string;
  service?: string;
};

export type SocialPost = {
  _id: Id<"socialPosts">;
  text: string;
  media: PickedMedia[];
  channelIds: string[];
  scheduledAt?: number;
  status: string;
  error?: string;
};

export function PostDialog({
  open,
  onOpenChange,
  post,
  timezone,
  channels,
  initialMedia,
  initialScheduledAt,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  post?: SocialPost | null;
  timezone: string;
  channels: SocialChannel[];
  initialMedia?: PickedMedia[];
  initialScheduledAt?: number;
}) {
  const saveDraft = useMutation(api.social.saveDraft);
  const update = useMutation(api.social.update);
  const remove = useMutation(api.social.remove);
  const schedule = useAction(api.socialNode.schedule);
  const publish = useAction(api.socialNode.publish);

  const [text, setText] = useState("");
  const [media, setMedia] = useState<PickedMedia[]>([]);
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Seed from the post being edited, or from a quick-schedule action.
  useEffect(() => {
    if (!open) return;
    if (post) {
      setText(post.text);
      setMedia(post.media);
      setChannelIds(post.channelIds);
      if (post.scheduledAt) {
        const p = epochToInputs(post.scheduledAt, timezone);
        setDate(p.date);
        setTime(p.time);
      } else {
        setDate("");
      }
    } else {
      setText("");
      setMedia(initialMedia ?? []);
      setChannelIds(channels.length === 1 ? [channels[0].id] : []);
      if (initialScheduledAt) {
        const p = epochToInputs(initialScheduledAt, timezone);
        setDate(p.date);
        setTime(p.time);
      } else {
        setDate("");
        setTime("09:00");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, post]);

  const scheduledAt =
    date && time ? zonedToEpoch(date, time, timezone) : undefined;
  const isSent = post?.status === "sent";

  async function onSave() {
    setBusy(true);
    try {
      if (post) {
        await update({
          id: post._id,
          text,
          media,
          channelIds,
          scheduledAt: scheduledAt ?? null,
        });
        toast.success("Saved");
      } else {
        await saveDraft({ text, media, channelIds, scheduledAt });
        toast.success("Saved to calendar");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function onPublish() {
    if (!channelIds.length) return toast.error("Pick at least one channel");
    setBusy(true);
    try {
      const res = post
        ? await (async () => {
            await update({
              id: post._id,
              text,
              media,
              channelIds,
              scheduledAt: scheduledAt ?? null,
            });
            return publish({ id: post._id });
          })()
        : await schedule({ text, media, channelIds, scheduledAt });
      if (res.ok)
        toast.success(scheduledAt ? "Scheduled to Buffer" : "Sent to Buffer");
      else toast.error(res.error ?? "Buffer rejected the post");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not publish");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{post ? "Edit post" : "New post"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Media strip */}
          <div className="flex flex-wrap gap-2">
            {media.map((m, i) => (
              <div
                key={m.url}
                className="bg-muted relative h-20 w-20 overflow-hidden rounded-lg"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.thumbnailUrl ?? m.url}
                  alt=""
                  className="h-full w-full object-cover"
                />
                {m.type === "video" && (
                  <Film className="absolute left-1 top-1 h-3.5 w-3.5 text-white drop-shadow" />
                )}
                {!isSent && (
                  <button
                    type="button"
                    onClick={() =>
                      setMedia((cur) => cur.filter((_, j) => j !== i))
                    }
                    className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
            {!isSent && (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="text-muted-foreground hover:text-foreground flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs"
              >
                <Plus className="h-4 w-4" /> Add
              </button>
            )}
          </div>

          {/* Caption */}
          <div className="space-y-1.5">
            <Label htmlFor="post-text">Caption</Label>
            <Textarea
              id="post-text"
              rows={3}
              value={text}
              disabled={isSent}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write a caption…"
            />
          </div>

          {/* Channels */}
          <div className="space-y-1.5">
            <Label>Channels</Label>
            {channels.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                Connect Buffer in Settings to pick channels. You can still save
                to the calendar.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {channels.map((c) => {
                  const on = channelIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={isSent}
                      onClick={() =>
                        setChannelIds((cur) =>
                          on ? cur.filter((x) => x !== c.id) : [...cur, c.id],
                        )
                      }
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs capitalize transition",
                        on
                          ? "bg-primary text-primary-foreground border-primary"
                          : "hover:bg-muted",
                      )}
                    >
                      <AtSign className="h-3 w-3" />
                      {c.name ?? c.service ?? c.id}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Schedule */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" /> Schedule
              <span className="text-muted-foreground font-normal">
                ({tzAbbrev(timezone)})
              </span>
            </Label>
            <div className="flex gap-2">
              <Input
                type="date"
                value={date}
                disabled={isSent}
                onChange={(e) => setDate(e.target.value)}
              />
              <Input
                type="time"
                value={time}
                disabled={isSent || !date}
                onChange={(e) => setTime(e.target.value)}
                className="w-32"
              />
            </div>
            {!date && (
              <p className="text-muted-foreground text-xs">
                No date = save as a draft.
              </p>
            )}
          </div>

          {post?.status === "error" && post.error && (
            <p className="text-destructive text-xs">{post.error}</p>
          )}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {post ? (
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={async () => {
                await remove({ id: post._id });
                toast.success("Deleted");
                onOpenChange(false);
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            {!isSent && (
              <Button variant="outline" onClick={onSave} disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            )}
            {!isSent && (
              <Button onClick={onPublish} disabled={busy || !media.length}>
                <Send className="mr-2 h-4 w-4" />
                {scheduledAt ? "Schedule" : "Post now"}
              </Button>
            )}
            {isSent && (
              <Badge className="bg-emerald-600 hover:bg-emerald-600">
                Sent to Buffer
              </Badge>
            )}
          </div>
        </DialogFooter>

        <MediaPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onPick={(picked) =>
            setMedia((cur) => {
              const seen = new Set(cur.map((m) => m.url));
              return [...cur, ...picked.filter((m) => !seen.has(m.url))];
            })
          }
        />
      </DialogContent>
    </Dialog>
  );
}
