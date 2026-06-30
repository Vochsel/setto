"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Film, Plus, Loader2 } from "lucide-react";
import { TEMPLATES } from "@setto/core/video";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDuration } from "@/lib/video-format";

export default function VideosPage() {
  const router = useRouter();
  const projects = useQuery(api.videoProjects.list, {});
  const create = useMutation(api.videoProjects.create);
  const [creating, setCreating] = useState(false);

  async function newProject(templateId: string) {
    setCreating(true);
    try {
      const { projectId } = await create({ templateId });
      router.push(`/videos/${projectId}`);
    } finally {
      setCreating(false);
    }
  }

  const NewButton = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={creating}>
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          New video
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {TEMPLATES.map((t) => (
          <DropdownMenuItem
            key={t.id}
            onClick={() => newProject(t.id)}
            className="flex-col items-start gap-0.5"
          >
            <span className="font-medium">
              {t.emoji} {t.name}
            </span>
            <span className="text-muted-foreground text-xs">
              {t.description}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      <PageHeader
        title="Videos"
        description="Turn your shots into edited videos"
      >
        {NewButton}
      </PageHeader>

      <div className="space-y-4 p-4 md:p-6">
        {projects === undefined ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[9/16] rounded-xl" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <EmptyState
            icon={Film}
            title="No videos yet"
            description="Create a video from your shots — a slideshow, a Ken Burns reel, motion clips, and more."
            action={NewButton}
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {projects.map((p) => (
              <button
                key={p._id}
                onClick={() => router.push(`/videos/${p._id}`)}
                className="group bg-card hover:border-foreground/20 overflow-hidden rounded-xl border text-left transition"
              >
                <div className="bg-muted relative aspect-[9/16] overflow-hidden">
                  {p.posterUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.posterUrl}
                      alt={p.name}
                      className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="text-muted-foreground flex h-full items-center justify-center">
                      <Film className="h-8 w-8" />
                    </div>
                  )}
                  <div className="absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
                    {formatDuration(p.durationMs)}
                  </div>
                </div>
                <div className="p-2.5">
                  <div className="truncate text-sm font-medium">{p.name}</div>
                  <div className="text-muted-foreground text-xs">
                    {p.clipCount} clip{p.clipCount === 1 ? "" : "s"} ·{" "}
                    {p.width}×{p.height}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
