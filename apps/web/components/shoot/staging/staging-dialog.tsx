"use client";

import { ReactNode, useState } from "react";
import dynamic from "next/dynamic";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import {
  Box,
  Camera,
  Lightbulb,
  User,
  Trash2,
  Grid3x3,
  Video,
  Save,
  Wand2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  emptyStage,
  framingFromCamera,
  centroidOfModels,
  type StageObject,
  type StageState,
} from "./types";
import type { Id } from "@/convex/_generated/dataModel";

const StagingScene = dynamic(
  () => import("./staging-scene").then((m) => m.StagingScene),
  {
    ssr: false,
    loading: () => (
      <div className="bg-muted/30 flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading 3D…
      </div>
    ),
  },
);

export function StagingDialog({
  trigger,
  shootLocationId,
  initialStaging,
  models,
  shotIds,
}: {
  trigger: ReactNode;
  shootLocationId: Id<"shootLocations">;
  initialStaging?: StageState | null;
  models: { _id: string; name: string }[];
  shotIds: Id<"shots">[];
}) {
  const saveStaging = useMutation(api.shootLocations.saveStaging);
  const updateShot = useMutation(api.shots.update);
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<StageState>(initialStaging ?? emptyStage());
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [view, setView] = useState<"top" | "camera">("top");

  const selected = stage.objects.find((o) => o.id === selectedId);

  function countOf(type: StageObject["type"]) {
    return stage.objects.filter((o) => o.type === type).length;
  }

  function addObject(o: Omit<StageObject, "id">) {
    const id = nanoid(8);
    setStage((s) => ({
      ...s,
      objects: [...s.objects, { ...o, id }],
      activeCameraId:
        o.type === "camera" && !s.activeCameraId ? id : s.activeCameraId,
    }));
    setSelectedId(id);
  }

  function addModel(m?: { _id: string; name: string }) {
    const n = countOf("model");
    addObject({
      type: "model",
      modelId: m?._id,
      name: m?.name ?? `Model ${n + 1}`,
      x: n * 1.2 - 0.6,
      y: 0,
      z: 0,
    });
  }

  function patchSelected(patch: Partial<StageObject>) {
    if (!selectedId) return;
    setStage((s) => ({
      ...s,
      objects: s.objects.map((o) =>
        o.id === selectedId ? { ...o, ...patch } : o,
      ),
    }));
  }

  function move(id: string, p: { x: number; y: number; z: number }) {
    setStage((s) => ({
      ...s,
      objects: s.objects.map((o) => (o.id === id ? { ...o, ...p } : o)),
    }));
  }

  function deleteSelected() {
    if (!selectedId) return;
    setStage((s) => ({
      ...s,
      objects: s.objects.filter((o) => o.id !== selectedId),
      activeCameraId:
        s.activeCameraId === selectedId ? undefined : s.activeCameraId,
    }));
    setSelectedId(undefined);
  }

  async function save() {
    try {
      await saveStaging({ id: shootLocationId, staging: stage });
      toast.success("Staging saved");
    } catch {
      toast.error("Could not save staging");
    }
  }

  async function applyFraming() {
    const cam =
      stage.objects.find((o) => o.id === stage.activeCameraId) ??
      stage.objects.find((o) => o.type === "camera");
    if (!cam) {
      toast.error("Add a camera first");
      return;
    }
    const framing = framingFromCamera(cam, centroidOfModels(stage.objects));
    try {
      await Promise.all(
        shotIds.map((id) => updateShot({ id, cameraFraming: framing })),
      );
      await saveStaging({ id: shootLocationId, staging: stage });
      toast.success(
        `Applied ${framing.shotType} / ${framing.angleLabel} to ${shotIds.length} shot(s)`,
      );
    } catch {
      toast.error("Could not apply framing");
    }
  }

  const cameras = stage.objects.filter((o) => o.type === "camera");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="flex h-[85vh] flex-col gap-0 p-0 sm:max-w-5xl">
        <DialogHeader className="flex-row items-center justify-between border-b px-4 py-3">
          <DialogTitle className="flex items-center gap-2">
            <Box className="h-4 w-4" /> Stage the scene
          </DialogTitle>
          <div className="flex items-center gap-2 pr-6">
            <div className="bg-muted flex rounded-md p-0.5">
              <Button
                variant={view === "top" ? "secondary" : "ghost"}
                size="sm"
                className="h-7"
                onClick={() => setView("top")}
              >
                <Grid3x3 className="h-3.5 w-3.5" /> Top-down
              </Button>
              <Button
                variant={view === "camera" ? "secondary" : "ghost"}
                size="sm"
                className="h-7"
                onClick={() => setView("camera")}
              >
                <Video className="h-3.5 w-3.5" /> Through camera
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-[1fr_260px]">
          <div className="relative min-h-0">
            <StagingScene
              stage={stage}
              view={view}
              selectedId={selectedId}
              onSelectId={setSelectedId}
              onMove={move}
            />
          </div>

          {/* Side panel */}
          <div className="flex flex-col gap-4 overflow-y-auto border-l p-3">
            <div className="space-y-2">
              <Label className="text-xs">Add to scene</Label>
              <div className="grid grid-cols-2 gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <User className="h-3.5 w-3.5" /> Model
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {models.length === 0 && (
                      <DropdownMenuItem onClick={() => addModel()}>
                        Blank model
                      </DropdownMenuItem>
                    )}
                    {models.map((m) => (
                      <DropdownMenuItem key={m._id} onClick={() => addModel(m)}>
                        {m.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    addObject({
                      type: "camera",
                      name: `Camera ${countOf("camera") + 1}`,
                      x: 0,
                      y: 1.6,
                      z: 4 + countOf("camera"),
                      fov: 50,
                    })
                  }
                >
                  <Camera className="h-3.5 w-3.5" /> Camera
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    addObject({
                      type: "light",
                      name: `Light ${countOf("light") + 1}`,
                      x: 3,
                      y: 4,
                      z: 3,
                      intensity: 8,
                    })
                  }
                >
                  <Lightbulb className="h-3.5 w-3.5" /> Light
                </Button>
              </div>
            </div>

            {cameras.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Active camera</Label>
                <Select
                  value={stage.activeCameraId ?? cameras[0]?.id}
                  onValueChange={(v) =>
                    setStage((s) => ({ ...s, activeCameraId: v }))
                  }
                >
                  <SelectTrigger size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {cameras.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selected ? (
              <div className="border-border space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize">
                    {selected.name ?? selected.type}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive size-7"
                    onClick={deleteSelected}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {selected.type === "camera" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      Field of view — {selected.fov ?? 50}°
                    </Label>
                    <Slider
                      min={14}
                      max={90}
                      step={1}
                      value={[selected.fov ?? 50]}
                      onValueChange={([v]) => patchSelected({ fov: v })}
                    />
                  </div>
                )}
                {selected.type === "light" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      Intensity — {selected.intensity ?? 8}
                    </Label>
                    <Slider
                      min={1}
                      max={30}
                      step={1}
                      value={[selected.intensity ?? 8]}
                      onValueChange={([v]) => patchSelected({ intensity: v })}
                    />
                  </div>
                )}
                <p className="text-muted-foreground text-[11px]">
                  Switch to top-down to drag this on the ground.
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-center text-xs">
                Click an object to select it.
              </p>
            )}

            <div className="mt-auto space-y-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={applyFraming}
                disabled={shotIds.length === 0}
              >
                <Wand2 className="h-4 w-4" /> Apply camera to shots
              </Button>
              <Button className="w-full" onClick={save}>
                <Save className="h-4 w-4" /> Save staging
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
