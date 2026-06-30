"use client";

import { ReactNode, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Confirm + run the "standardize references" back-migration. With no `modelIds`
 * it standardizes every model in the workspace; pass `modelIds` to target one.
 * The migration regenerates a single neutral model sheet (seeded from a model's
 * current images) and replaces those images with it — hence the confirm.
 */
export function StandardizeModelsButton({
  trigger,
  modelIds,
  title = "Standardize model references?",
  description,
}: {
  trigger: ReactNode;
  modelIds?: Id<"models">[];
  title?: string;
  description?: string;
}) {
  const migrate = useAction(api.generate.migrateModelsToSheets);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const desc =
    description ??
    "Regenerates a single neutral reference sheet (face, a few angles and a " +
      "T-pose) for each model — using its current images only to seed identity — " +
      "then replaces those images with the new sheet. Runs in the background and " +
      "costs one generation per model.";

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{desc}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const r = await migrate(modelIds ? { modelIds } : {});
                if (r.scheduled === 0) {
                  toast.info("No models with reference images to standardize");
                } else {
                  toast.success(
                    `Standardizing ${r.scheduled} model${r.scheduled > 1 ? "s" : ""} in the background…`,
                  );
                }
                setOpen(false);
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Could not start",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Standardize
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
