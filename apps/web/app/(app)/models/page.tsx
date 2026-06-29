"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Plus, Users, Pencil, Trash2, Wand2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import Link from "next/link";
import { LibraryTile } from "@/components/library-tile";
import { ConfirmDelete } from "@/components/confirm-delete";
import { ModelEditor } from "@/components/model-editor";
import { StandardizeModelsButton } from "@/components/standardize-models-button";

export default function ModelsPage() {
  const models = useQuery(api.models.list, {});
  const remove = useMutation(api.models.remove);

  return (
    <>
      <PageHeader title="Models" description="People you can cast into shots">
        {models && models.length > 0 && (
          <StandardizeModelsButton
            trigger={
              <Button variant="outline">
                <Wand2 className="h-4 w-4" /> Standardize references
              </Button>
            }
          />
        )}
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
              // Thumbnail: headshot first, falling back to the model sheet.
              const thumb = m.headshotUrl ?? m.sheetUrl;
              const tile = (
                <LibraryTile
                  icon={Users}
                  aspect="portrait"
                  imageUrl={thumb}
                  title={m.name}
                  subtitle={m.promptDescriptor ?? m.description}
                />
              );
              return (
                <div key={m._id} className="group relative">
                  {/* Hover actions */}
                  <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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

                  {/* Click → the model's page (info + every photo they're in) */}
                  <Link href={`/models/${m._id}`} className="block">
                    {tile}
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
