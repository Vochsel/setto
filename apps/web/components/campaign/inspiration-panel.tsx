"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { ImageUploader } from "@/components/image-uploader";
import { cleanImageRefs, withDisplayUrls, type ImageRef } from "@/lib/types";
import type { Id } from "@/convex/_generated/dataModel";

export function InspirationPanel({
  campaignId,
  refs,
  urls,
}: {
  campaignId: Id<"campaigns">;
  refs?: ImageRef[];
  urls?: { url: string }[];
}) {
  const update = useMutation(api.campaigns.update);
  const value = withDisplayUrls(refs, urls);

  function onChange(next: ImageRef[]) {
    update({
      id: campaignId,
      inspirationRefs: cleanImageRefs(next),
    }).catch(() => toast.error("Could not save inspiration"));
  }

  return (
    <Card className="gap-3 p-4">
      <div>
        <h2 className="text-sm font-medium">Inspiration</h2>
        <p className="text-muted-foreground text-xs">
          Upload ad designs you like — used as style &amp; layout references.
        </p>
      </div>
      <ImageUploader value={value} onChange={onChange} max={8} />
    </Card>
  );
}
