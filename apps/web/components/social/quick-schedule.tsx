"use client";

import { useEffect, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { DEFAULT_TZ } from "@/lib/timezone";
import {
  PostDialog,
  type SocialChannel,
} from "@/components/social/post-dialog";
import type { PickedMedia } from "@/components/social/media-picker";

/**
 * Self-contained quick-schedule surface: renders a trigger (via `children`) that
 * opens a fresh PostDialog seeded with `media`. Loads the workspace timezone and
 * — if Buffer is connected — its channels lazily, only once the dialog opens, so
 * it's cheap to drop anywhere (image lightbox, gallery card, etc.).
 */
export function QuickSchedule({
  media,
  children,
}: {
  media: PickedMedia | null;
  children: (open: () => void) => React.ReactNode;
}) {
  const settings = useQuery(api.settings.get, {});
  const connections = useQuery(api.integrations.list, {});
  const loadChannels = useAction(api.socialNode.channels);

  const tz = settings?.timezone ?? DEFAULT_TZ;
  const buffer = connections?.find((c) => c.provider === "buffer");

  const [open, setOpen] = useState(false);
  const [channels, setChannels] = useState<SocialChannel[]>([]);

  // Fetch Buffer channels the first time the dialog opens (and Buffer is live).
  useEffect(() => {
    if (!open || buffer?.status !== "connected" || channels.length) return;
    loadChannels({})
      .then((c) => setChannels(c as SocialChannel[]))
      .catch(() => {});
  }, [open, buffer?.status, channels.length, loadChannels]);

  return (
    <>
      {children(() => setOpen(true))}
      <PostDialog
        open={open}
        onOpenChange={setOpen}
        timezone={tz}
        channels={channels}
        initialMedia={media ? [media] : []}
      />
    </>
  );
}
