"use client";

import { ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

/** Current local time formatted for a <input type="datetime-local">. */
const nowLocal = () => format(new Date(), "yyyy-MM-dd'T'HH:mm");

export function NewShootDialog({ trigger }: { trigger: ReactNode }) {
  const router = useRouter();
  const createShoot = useMutation(api.shoots.create);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [when, setWhen] = useState(nowLocal);
  const [saving, setSaving] = useState(false);

  // Reset on open so the date/time always defaults to "now" and fields are clean.
  function handleOpenChange(next: boolean) {
    if (next) {
      setName("");
      setDescription("");
      setWhen(nowLocal());
    }
    setOpen(next);
  }

  async function submit() {
    if (!name.trim()) {
      toast.error("Give the shoot a name");
      return;
    }
    setSaving(true);
    try {
      const id = await createShoot({
        name: name.trim(),
        description: description.trim() || undefined,
        scheduledAt: when ? new Date(when).getTime() : undefined,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      toast.success("Shoot created");
      setOpen(false);
      router.push(`/shoots/${id}`);
    } catch {
      toast.error("Could not create shoot");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New shoot</DialogTitle>
          <DialogDescription>
            Set up a shoot, then add locations, models and shots.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="shoot-name">Name</Label>
            <Input
              id="shoot-name"
              autoFocus
              placeholder="Spring campaign — Lisbon"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="shoot-when">Date &amp; time</Label>
            <Input
              id="shoot-when"
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="shoot-desc">Description</Label>
            <Textarea
              id="shoot-desc"
              placeholder="Optional brief…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Create shoot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
