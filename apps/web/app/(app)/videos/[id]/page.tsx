"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { VideoEditor } from "@/components/video/video-editor";

export default function VideoEditorPage() {
  const params = useParams<{ id: string }>();
  return <VideoEditor projectId={params.id as Id<"videoProjects">} />;
}
