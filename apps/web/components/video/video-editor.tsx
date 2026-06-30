"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Player } from "@remotion/player";
import { Timeline } from "@setto/remotion/Timeline";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  TEMPLATES,
  RESOLUTIONS,
  FPS_OPTIONS,
  getTemplate,
  getResolution,
  buildClips,
  defaultKenBurns,
  specDurationFrames,
  specDurationMs,
  type VideoClip,
  type VideoSpec,
  type MediaInput,
} from "@setto/core/video";
import {
  ArrowLeft,
  Download,
  Loader2,
  Music,
  Plus,
  Film,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipStrip } from "@/components/video/clip-strip";
import { AddClipsDialog } from "@/components/video/add-clips-dialog";
import { formatDuration } from "@/lib/video-format";

export function VideoEditor({ projectId }: { projectId: Id<"videoProjects"> }) {
  const convex = useConvex();
  const project = useQuery(api.videoProjects.get, { id: projectId });
  const renders = useQuery(api.videoRenders.listByProject, { projectId });

  const setClipsMut = useMutation(api.videoProjects.setClips);
  const updateSettingsMut = useMutation(api.videoProjects.updateSettings);
  const renameMut = useMutation(api.videoProjects.rename);
  const startRender = useMutation(api.videoRenders.start);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  // Local working copy of the editable spec (seeded once from the server).
  const [clips, setClips] = useState<VideoClip[] | null>(null);
  const [settings, setSettings] = useState<Omit<VideoSpec, "clips"> | null>(
    null,
  );
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const seeded = useRef(false);

  useEffect(() => {
    if (project && !seeded.current) {
      seeded.current = true;
      setClips(project.clips);
      setName(project.name);
      setSettings({
        templateId: project.templateId,
        width: project.width,
        height: project.height,
        fps: project.fps,
        background: project.background,
        audio: project.audio,
      });
    }
  }, [project]);

  const spec: VideoSpec | null = useMemo(
    () => (settings && clips ? { ...settings, clips } : null),
    [settings, clips],
  );

  // ── Persistence helpers ──────────────────────────────────────────────────
  const clipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function commitClips(next: VideoClip[], immediate = false) {
    setClips(next);
    if (clipTimer.current) clearTimeout(clipTimer.current);
    const run = () => void setClipsMut({ projectId, clips: next });
    if (immediate) run();
    else clipTimer.current = setTimeout(run, 350);
  }

  function commitSettings(patch: {
    templateId?: string;
    width?: number;
    height?: number;
    fps?: number;
    background?: string | null;
    audio?: VideoSpec["audio"] | null;
  }) {
    setSettings((s) => {
      if (!s) return s;
      const next = { ...s };
      if (patch.templateId !== undefined) next.templateId = patch.templateId;
      if (patch.width !== undefined) next.width = patch.width;
      if (patch.height !== undefined) next.height = patch.height;
      if (patch.fps !== undefined) next.fps = patch.fps;
      if (patch.background !== undefined)
        next.background = patch.background ?? undefined;
      if (patch.audio !== undefined) next.audio = patch.audio ?? undefined;
      return next;
    });
    void updateSettingsMut({ projectId, ...patch });
  }

  // ── Clip ops ─────────────────────────────────────────────────────────────
  function retime(id: string, ms: number) {
    if (!clips) return;
    commitClips(clips.map((c) => (c.id === id ? { ...c, durationMs: ms } : c)));
  }
  function deleteClip(id: string) {
    if (!clips) return;
    commitClips(clips.filter((c) => c.id !== id), true);
  }
  function toggleKenBurns(id: string) {
    if (!clips) return;
    commitClips(
      clips.map((c, i) => {
        if (c.id !== id) return c;
        const on = c.effect?.type === "kenburns";
        return { ...c, effect: on ? { type: "none" } : defaultKenBurns(i) };
      }),
      true,
    );
  }
  function reorder(next: VideoClip[]) {
    commitClips(next, true);
  }
  function addMedia(media: MediaInput[]) {
    if (!clips || !settings) return;
    const template = getTemplate(settings.templateId);
    const built = buildClips(media, template);
    commitClips([...clips, ...built], true);
  }

  // ── Settings ops ─────────────────────────────────────────────────────────
  function changeTemplate(templateId: string) {
    if (!clips) return;
    const template = getTemplate(templateId);
    // Re-apply the template "look" (effect + transitions) while preserving each
    // clip's retimed duration.
    const next = clips.map((c, i) => {
      if (c.sourceType === "video") return c;
      return {
        ...c,
        effect:
          template.defaultEffect === "kenburns"
            ? defaultKenBurns(i)
            : { type: "none" as const },
        transition:
          i === 0
            ? { type: "none" as const, durationMs: 0 }
            : { ...template.defaultTransition },
      };
    });
    commitClips(next, true);
    commitSettings({ templateId });
  }

  function changeResolution(key: string) {
    const r = getResolution(key);
    commitSettings({ width: r.width, height: r.height });
  }

  async function handleAudioUpload(file: File) {
    setUploadingAudio(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await res.json();
      const url = await convex.query(api.files.getUrl, { storageId });
      if (!url) throw new Error("Could not resolve uploaded file");
      commitSettings({ audio: { url, name: file.name, volume: 1 } });
      toast.success("Audio added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Audio upload failed");
    } finally {
      setUploadingAudio(false);
    }
  }

  async function saveName() {
    if (project && name.trim() && name !== project.name) {
      await renameMut({ projectId, name });
    }
  }

  async function doExport() {
    setExporting(true);
    try {
      await startRender({ projectId });
      toast.success("Export started — rendering your video…");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start export");
    } finally {
      setExporting(false);
    }
  }

  if (project === undefined || !spec || !settings || !clips) {
    return (
      <>
        <PageHeader title="Loading…" />
        <div className="p-6">
          <Skeleton className="mx-auto h-[60vh] w-full max-w-sm rounded-xl" />
        </div>
      </>
    );
  }

  const template = getTemplate(settings.templateId);
  const resolutionKey =
    RESOLUTIONS.find((r) => r.width === settings.width && r.height === settings.height)
      ?.key ?? RESOLUTIONS[0].key;
  const isPortrait = settings.height >= settings.width;
  const latestRender = renders?.[0];
  const totalMs = specDurationMs(spec);

  return (
    <>
      <PageHeader
        title={
          <div className="flex items-center gap-2">
            <Link
              href="/videos"
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              className="h-8 w-48 border-transparent px-1 text-base font-semibold hover:border-input focus:border-input"
            />
          </div>
        }
        description={`${clips.length} clip${clips.length === 1 ? "" : "s"} · ${formatDuration(totalMs)}`}
      >
        <Button variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> Add clips
        </Button>
        <Button onClick={doExport} disabled={exporting || clips.length === 0}>
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Export
        </Button>
      </PageHeader>

      <div className="grid gap-4 p-4 md:grid-cols-[1fr_300px] md:p-6">
        {/* Preview */}
        <div className="min-w-0">
          {clips.length === 0 ? (
            <div className="bg-muted/40 flex aspect-video flex-col items-center justify-center gap-3 rounded-xl border border-dashed">
              <Film className="text-muted-foreground h-8 w-8" />
              <p className="text-muted-foreground text-sm">
                Add clips to start your video
              </p>
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" /> Add clips
              </Button>
            </div>
          ) : (
            <div
              className="mx-auto overflow-hidden rounded-xl bg-black"
              style={{ maxWidth: isPortrait ? 360 : 640 }}
            >
              <Player
                component={Timeline}
                inputProps={spec}
                durationInFrames={specDurationFrames(spec)}
                fps={spec.fps}
                compositionWidth={spec.width}
                compositionHeight={spec.height}
                style={{ width: "100%" }}
                controls
                loop
              />
            </div>
          )}
        </div>

        {/* Settings */}
        <div className="space-y-4">
          <Field label="Template">
            <Select value={settings.templateId} onValueChange={changeTemplate}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.emoji} {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground mt-1 text-xs">
              {template.description}
            </p>
          </Field>

          <Field label="Resolution">
            <Select value={resolutionKey} onValueChange={changeResolution}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESOLUTIONS.map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Frame rate">
            <Select
              value={String(settings.fps)}
              onValueChange={(v) => commitSettings({ fps: Number(v) })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FPS_OPTIONS.map((f) => (
                  <SelectItem key={f} value={String(f)}>
                    {f} fps
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Background audio">
            {settings.audio ? (
              <div className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
                <Music className="text-muted-foreground h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  {settings.audio.name ?? "Audio track"}
                </span>
                <button
                  onClick={() => commitSettings({ audio: null })}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="hover:border-foreground/30 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-2 py-2 text-sm">
                {uploadingAudio ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Music className="h-4 w-4" />
                )}
                Upload track
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleAudioUpload(f);
                  }}
                />
              </label>
            )}
          </Field>

          <ExportPanel latestRender={latestRender} />
        </div>
      </div>

      {/* Timeline strip */}
      {clips.length > 0 ? (
        <div className="border-t p-4 md:px-6">
          <ClipStrip
            clips={clips}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onReorder={reorder}
            onRetime={retime}
            onDelete={deleteClip}
            onToggleKenBurns={toggleKenBurns}
          />
        </div>
      ) : null}

      <AddClipsDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        shootId={project.shootId ?? undefined}
        onAdd={addMedia}
      />
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-muted-foreground mb-1.5 text-xs">{label}</Label>
      {children}
    </div>
  );
}

function ExportPanel({
  latestRender,
}: {
  latestRender:
    | {
        status: string;
        progress?: number;
        progressLabel?: string;
        outputUrl?: string;
        error?: string;
      }
    | undefined;
}) {
  if (!latestRender) return null;
  const { status, progress, progressLabel, outputUrl, error } = latestRender;

  return (
    <div className="rounded-md border p-3 text-sm">
      <div className="mb-1 font-medium">Latest export</div>
      {status === "succeeded" && outputUrl ? (
        <a
          href={outputUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground inline-flex items-center gap-1.5 underline"
        >
          <Download className="h-4 w-4" /> Download mp4
        </a>
      ) : status === "failed" ? (
        <p className="text-destructive text-xs">{error ?? "Render failed"}</p>
      ) : (
        <div>
          <div className="bg-muted h-1.5 overflow-hidden rounded-full">
            <div
              className="bg-foreground h-full transition-all"
              style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
            />
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            {progressLabel ?? "Rendering…"}
          </p>
        </div>
      )}
    </div>
  );
}
