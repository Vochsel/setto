"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Pencil, Users, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ModelEditor } from "@/components/model-editor";
import { PhotoMasonry } from "@/components/photo-masonry";
import type { Id } from "@/convex/_generated/dataModel";

export default function ModelDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id as Id<"models">;
  const model = useQuery(api.models.get, { id });
  const photos = useQuery(api.generations.listByModel, { modelId: id });

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

  const refs = model.imageUrls ?? [];

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
            <div className="flex gap-2 overflow-x-auto pb-1">
              {refs.map((r, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={r.url}
                  alt=""
                  className="h-28 w-28 shrink-0 rounded-lg border object-cover"
                />
              ))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-medium">
            Photos featuring {model.name}{" "}
            <span className="text-muted-foreground">
              ({photos?.length ?? 0})
            </span>
          </h2>
          <PhotoMasonry
            photos={photos?.map((p) => ({
              _id: p._id,
              imageUrl: p.imageUrl,
              caption: p.modelLabel,
            }))}
            emptyIcon={Users}
            emptyTitle={`No photos of ${model.name} yet`}
            emptyDescription="Cast this model into shots and generate — every image they appear in collects here."
          />
        </section>
      </div>
    </>
  );
}
