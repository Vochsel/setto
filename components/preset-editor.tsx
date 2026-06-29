"use client";

import { ReactNode, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type PresetType = "photography_style" | "camera_setup" | "lighting";

export const PRESET_TYPE_LABEL: Record<PresetType, string> = {
  photography_style: "Photography style",
  camera_setup: "Camera setup",
  lighting: "Lighting",
};

interface PresetDoc {
  _id: string;
  type: PresetType;
  name: string;
  description?: string;
  promptDescriptor?: string;
}

export function PresetEditor({
  trigger,
  type,
  preset,
}: {
  trigger: ReactNode;
  type: PresetType;
  preset?: PresetDoc;
}) {
  const create = useMutation(api.presets.create);
  const update = useMutation(api.presets.update);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selType, setSelType] = useState<PresetType>(preset?.type ?? type);
  const [name, setName] = useState(preset?.name ?? "");
  const [description, setDescription] = useState(preset?.description ?? "");
  const [descriptor, setDescriptor] = useState(preset?.promptDescriptor ?? "");

  // Reset on open so a reused "New …" trigger always starts fresh.
  function handleOpenChange(next: boolean) {
    if (next) {
      setSelType(preset?.type ?? type);
      setName(preset?.name ?? "");
      setDescription(preset?.description ?? "");
      setDescriptor(preset?.promptDescriptor ?? "");
    }
    setOpen(next);
  }

  async function submit() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      if (preset) {
        await update({
          id: preset._id as never,
          type: selType,
          name: name.trim(),
          description: description.trim() || undefined,
          promptDescriptor: descriptor.trim() || undefined,
        });
      } else {
        await create({
          type: selType,
          name: name.trim(),
          description: description.trim() || undefined,
          promptDescriptor: descriptor.trim() || undefined,
        });
      }
      toast.success(preset ? "Preset updated" : "Preset created");
      setOpen(false);
    } catch {
      toast.error("Could not save preset");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {preset ? "Edit" : "New"} {PRESET_TYPE_LABEL[selType].toLowerCase()}
          </DialogTitle>
          <DialogDescription>
            The descriptor is folded into the prompt whenever this preset is
            selected on a shot.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="p-type">Type</Label>
            <Select
              value={selType}
              onValueChange={(v) => setSelType(v as PresetType)}
            >
              <SelectTrigger id="p-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  Object.keys(PRESET_TYPE_LABEL) as PresetType[]
                ).map((t) => (
                  <SelectItem key={t} value={t}>
                    {PRESET_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="p-name">Name</Label>
            <Input
              id="p-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="85mm Portrait"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="p-descriptor">Prompt descriptor</Label>
            <Textarea
              id="p-descriptor"
              value={descriptor}
              onChange={(e) => setDescriptor(e.target.value)}
              placeholder="shot on an 85mm f/1.4 lens, creamy bokeh, eye-level…"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="p-desc">Short label</Label>
            <Input
              id="p-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Classic flattering portrait"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {preset ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
