"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Plus, SlidersHorizontal, Sparkles, Pencil } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDelete } from "@/components/confirm-delete";
import {
  PresetEditor,
  PRESET_TYPE_LABEL,
  type PresetType,
} from "@/components/preset-editor";
import { Trash2 } from "lucide-react";

const TYPES: PresetType[] = ["photography_style", "camera_setup", "lighting"];

function PresetList({ type }: { type: PresetType }) {
  const presets = useQuery(api.presets.list, { type });
  const remove = useMutation(api.presets.remove);
  const seed = useMutation(api.presets.seedDefaults);

  if (presets === undefined) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  if (presets.length === 0) {
    return (
      <EmptyState
        icon={SlidersHorizontal}
        title={`No ${PRESET_TYPE_LABEL[type].toLowerCase()} presets`}
        description="Create your own, or seed a curated starter set you can tweak."
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                const r = await seed({});
                toast.success(
                  r.seeded ? "Starter presets added" : "Presets already exist",
                );
              }}
            >
              <Sparkles className="h-4 w-4" /> Seed starter set
            </Button>
            <PresetEditor
              type={type}
              trigger={
                <Button>
                  <Plus className="h-4 w-4" /> New
                </Button>
              }
            />
          </div>
        }
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {presets.map((p) => (
        <Card key={p._id} className="group gap-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-medium">{p.name}</h3>
              {p.description ? (
                <p className="text-muted-foreground text-xs">{p.description}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <PresetEditor
                type={type}
                preset={p}
                trigger={
                  <Button variant="ghost" size="icon" className="size-7">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                }
              />
              <ConfirmDelete
                title={`Delete ${p.name}?`}
                onConfirm={async () => {
                  await remove({ id: p._id });
                  toast.success("Preset deleted");
                }}
                trigger={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive size-7"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                }
              />
            </div>
          </div>
          {p.promptDescriptor ? (
            <p className="text-muted-foreground bg-muted/40 line-clamp-3 rounded-md p-2 font-mono text-xs">
              {p.promptDescriptor}
            </p>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

export default function PresetsPage() {
  return (
    <>
      <PageHeader
        title="Presets"
        description="Reusable photography styles, camera setups and lighting"
      />
      <div className="p-4 md:p-6">
        <Tabs defaultValue={TYPES[0]}>
          <div className="flex items-center justify-between">
            <TabsList>
              {TYPES.map((t) => (
                <TabsTrigger key={t} value={t}>
                  {PRESET_TYPE_LABEL[t]}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {TYPES.map((t) => (
            <TabsContent key={t} value={t} className="mt-4">
              <div className="mb-3 flex justify-end">
                <PresetEditor
                  type={t}
                  trigger={
                    <Button variant="outline" size="sm">
                      <Plus className="h-4 w-4" /> New {PRESET_TYPE_LABEL[t].toLowerCase()}
                    </Button>
                  }
                />
              </div>
              <PresetList type={t} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </>
  );
}
