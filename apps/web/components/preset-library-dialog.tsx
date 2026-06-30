"use client";

import { ReactNode, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Check, Plus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { PRESET_TYPE_LABEL } from "@/components/preset-editor";
import {
  PRESET_CATALOG,
  type CatalogPreset,
  type PresetType,
} from "@/lib/presetCatalog";
import type { Id } from "@/convex/_generated/dataModel";

const TYPES: PresetType[] = ["photography_style", "camera_setup", "lighting"];

export function PresetLibraryDialog({ trigger }: { trigger: ReactNode }) {
  const presets = useQuery(api.presets.list, {});
  const create = useMutation(api.presets.create);
  const remove = useMutation(api.presets.remove);
  const [busy, setBusy] = useState<string | null>(null);

  const existing = new Map<string, Id<"presets">>();
  (presets ?? []).forEach((p) => existing.set(`${p.type}|${p.name}`, p._id));

  async function toggle(entry: CatalogPreset) {
    const key = `${entry.type}|${entry.name}`;
    setBusy(key);
    try {
      const id = existing.get(key);
      if (id) {
        await remove({ id });
        toast.success(`Removed ${entry.name}`);
      } else {
        await create({
          type: entry.type,
          name: entry.name,
          description: entry.description,
          promptDescriptor: entry.promptDescriptor,
        });
        toast.success(`Added ${entry.name}`);
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Preset library</DialogTitle>
          <DialogDescription>
            Add curated styles, camera setups and lighting to your workspace —
            remove any anytime.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue={TYPES[0]}>
          <TabsList>
            {TYPES.map((t) => (
              <TabsTrigger key={t} value={t}>
                {PRESET_TYPE_LABEL[t]}
              </TabsTrigger>
            ))}
          </TabsList>

          {TYPES.map((t) => (
            <TabsContent key={t} value={t} className="mt-3">
              <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                {PRESET_CATALOG.filter((e) => e.type === t).map((e) => {
                  const key = `${e.type}|${e.name}`;
                  const added = existing.has(key);
                  return (
                    <div
                      key={key}
                      className="flex items-start justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{e.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {e.description}
                        </p>
                        <p className="text-muted-foreground/80 mt-1 line-clamp-2 font-mono text-[11px]">
                          {e.promptDescriptor}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={added ? "secondary" : "default"}
                        disabled={busy === key}
                        onClick={() => toggle(e)}
                        title={added ? "Click to remove" : "Add to workspace"}
                        className="shrink-0"
                      >
                        {busy === key ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : added ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                        {added ? "Added" : "Add"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
