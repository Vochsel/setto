"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Film, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Drop-in "start a video" entry point for the shoot / shots / model / wardrobe
 * surfaces. Pass whichever source you have: explicit images (generationIds),
 * whole shots (shotIds), or just a shoot to scope an empty project to. Creates
 * the project and navigates straight into the editor.
 */
export function MakeVideoButton({
  generationIds,
  shotIds,
  shootId,
  templateId,
  label = "Make video",
  variant = "outline",
  size = "default",
  className,
}: {
  generationIds?: Id<"generations">[];
  shotIds?: Id<"shots">[];
  shootId?: Id<"shoots">;
  templateId?: string;
  label?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const router = useRouter();
  const createEmpty = useMutation(api.videoProjects.create);
  const fromGenerations = useMutation(api.videoProjects.createFromGenerations);
  const fromShots = useMutation(api.videoProjects.createFromShots);
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      let projectId: Id<"videoProjects">;
      if (generationIds && generationIds.length) {
        ({ projectId } = await fromGenerations({
          generationIds,
          templateId,
          shootId,
        }));
      } else if (shotIds && shotIds.length) {
        ({ projectId } = await fromShots({ shotIds, templateId, shootId }));
      } else {
        ({ projectId } = await createEmpty({ templateId, shootId }));
      }
      router.push(`/videos/${projectId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create video");
      setBusy(false);
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={go}
      disabled={busy}
      className={className}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Film className="h-4 w-4" />
      )}
      {label}
    </Button>
  );
}
