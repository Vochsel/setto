"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Pencil, Users, ArrowLeft, Wand2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ModelEditor } from "@/components/model-editor";
import { StandardizeModelsButton } from "@/components/standardize-models-button";
import { PhotoMasonry, mergeMedia } from "@/components/photo-masonry";
import type { Id } from "@/convex/_generated/dataModel";

export default function ModelDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id as Id<"models">;
  const model = useQuery(api.models.get, { id });
  const images = useQuery(api.generations.listByModel, { modelId: id });
  const videos = useQuery(api.videos.listByModel, { modelId: id });
  const photos = mergeMedia(images, videos);

  if (model === undefined) {
    return (
      <>
        <PageHeader title={<Skeleton className="h-5 w-40" />} />
        <div className="p-6">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </>
    );
  }
  if (model === null) {
    return (
      <>
        <PageHeader title="Model not found" />
        <div className="p-6">
          <Button asChild>
            <Link href="/models">Back to models</Link>
          </Button>
        </div>
      </>
    );
  }

  const refs = [
    model.headshotUrl
      ? { url: model.headshotUrl, label: "Headshot" }
      : null,
    model.sheetUrl ? { url: model.sheetUrl, label: "Model sheet" } : null,
  ].filter((r): r is { url: string; label: string } => r !== null);

  return (
    <>
      <PageHeader
        title={model.name}
        description={model.promptDescriptor ?? model.description}
      >
        <Button asChild variant="ghost" size="sm">
          <Link href="/models">
            <ArrowLeft className="h-4 w-4" /> Models
          </Link>
        </Button>
        {refs.length > 0 && (
          <StandardizeModelsButton
            modelIds={[id]}
            title={`Standardize ${model.name}'s reference?`}
            trigger={
              <Button variant="outline" size="sm">
                <Wand2 className="h-4 w-4" /> Standardize
              </Button>
            }
          />
        )}
        <ModelEditor
          model={model}
          trigger={
            <Button variant="outline" size="sm">
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          }
        />
      </PageHeader>

      <div className="space-y-6 p-4 md:p-6">
        {refs.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-muted-foreground text-sm font-medium">
              Reference images
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {refs.map((r) => (
                <figure key={r.label} className="shrink-0 space-y-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.url}
                    alt={r.label}
                    className="h-40 w-32 rounded-lg border object-cover"
                  />
                  <figcaption className="text-muted-foreground text-center text-xs">
                    {r.label}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-medium">
            Photos &amp; videos featuring {model.name}{" "}
            <span className="text-muted-foreground">
              ({photos?.length ?? 0})
            </span>
          </h2>
          <PhotoMasonry
            photos={photos}
            emptyIcon={Users}
            emptyTitle={`No photos of ${model.name} yet`}
            emptyDescription="Cast this model into shots and generate — every image they appear in collects here."
          />
        </section>
      </div>
    </>
  );
}
