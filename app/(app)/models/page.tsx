"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Plus, Users, Wand2, Pencil, Trash2, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { LibraryTile } from "@/components/library-tile";
import { ConfirmDelete } from "@/components/confirm-delete";
import { ModelEditor } from "@/components/model-editor";
import { ImageLightbox } from "@/components/image-lightbox";
import type { Id } from "@/convex/_generated/dataModel";

export default function ModelsPage() {
  const models = useQuery(api.models.list, {});
  const remove = useMutation(api.models.remove);
  const generateVariations = useAction(api.generate.generateModelVariations);

  const [lb, setLb] = useState<{
    images: { url?: string }[];
    index: number;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function genVariation(id: Id<"models">) {
    setBusy(id);
    try {
      await generateVariations({ modelId: id });
      toast.success("Generating a variation in the background…");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title="Models" description="People you can cast into shots">
        <ModelEditor
          trigger={
            <Button>
              <Plus className="h-4 w-4" /> New model
            </Button>
          }
        />
      </PageHeader>

      <div className="p-4 md:p-6">
        {models === undefined ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[4/5] rounded-xl" />
            ))}
          </div>
        ) : models.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No models yet"
            description="Add people with reference images and a descriptor, or generate one with AI."
            action={
              <ModelEditor
                trigger={
                  <Button>
                    <Plus className="h-4 w-4" /> New model
                  </Button>
                }
              />
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {models.map((m) => {
              const imgs = m.imageUrls ?? [];
              const tile = (
                <LibraryTile
                  icon={Users}
                  aspect="portrait"
                  imageUrl={imgs[0]?.url}
                  title={m.name}
                  subtitle={m.promptDescriptor ?? m.description}
                />
              );
              return (
                <div key={m._id} className="group relative">
                  {/* Hover actions */}
                  <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="secondary"
                      size="icon"
                      title="Generate variation (background)"
                      className="bg-background/85 size-7 rounded-full shadow-sm backdrop-blur"
                      disabled={busy === m._id}
                      onClick={() => genVariation(m._id)}
                    >
                      {busy === m._id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Wand2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <ModelEditor
                      model={m}
                      trigger={
                        <Button
                          variant="secondary"
                          size="icon"
                          title="Edit"
                          className="bg-background/85 size-7 rounded-full shadow-sm backdrop-blur"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      }
                    />
                    <ConfirmDelete
                      title={`Delete ${m.name}?`}
                      onConfirm={async () => {
                        await remove({ id: m._id });
                        toast.success("Model deleted");
                      }}
                      trigger={
                        <Button
                          variant="secondary"
                          size="icon"
                          title="Delete"
                          className="bg-background/85 text-muted-foreground hover:text-destructive size-7 rounded-full shadow-sm backdrop-blur"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      }
                    />
                  </div>

                  {/* Click image → lightbox; if no images, click → editor */}
                  {imgs.length ? (
                    <button
                      type="button"
                      onClick={() =>
                        setLb({
                          images: imgs.map((u) => ({ url: u.url })),
                          index: 0,
                        })
                      }
                      className="block w-full cursor-zoom-in text-left"
                    >
                      {tile}
                    </button>
                  ) : (
                    <ModelEditor
                      model={m}
                      trigger={
                        <button className="block w-full text-left">
                          {tile}
                        </button>
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ImageLightbox
        images={lb?.images ?? []}
        index={lb?.index ?? null}
        onIndexChange={(i) => setLb((s) => (s ? { ...s, index: i } : s))}
        onClose={() => setLb(null)}
      />
    </>
  );
}
