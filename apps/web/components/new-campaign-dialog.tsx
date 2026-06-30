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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { ASPECT_RATIOS } from "@/lib/format";

export function NewCampaignDialog({ trigger }: { trigger: ReactNode }) {
  const router = useRouter();
  const createCampaign = useMutation(api.campaigns.create);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [aspectRatio, setAspectRatio] = useState("4:5");
  const [saving, setSaving] = useState(false);

  function handleOpenChange(next: boolean) {
    if (next) {
      setName("");
      setBrief("");
      setAspectRatio("4:5");
    }
    setOpen(next);
  }

  async function submit() {
    if (!name.trim()) {
      toast.error("Give the campaign a name");
      return;
    }
    setSaving(true);
    try {
      const id = await createCampaign({
        name: name.trim(),
        brief: brief.trim() || undefined,
        aspectRatio,
      });
      toast.success("Campaign created");
      setOpen(false);
      router.push(`/campaigns/${id}`);
    } catch {
      toast.error("Could not create campaign");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New campaign</DialogTitle>
          <DialogDescription>
            Write copy, add inspiration, pick shots, and generate ad creatives.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="c-name">Name</Label>
            <Input
              id="c-name"
              autoFocus
              placeholder="Spring launch — Lisbon"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="c-brief">Brief</Label>
            <Textarea
              id="c-brief"
              placeholder="Product, audience, tone, goal…"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="c-ratio">Aspect ratio</Label>
            <Select value={aspectRatio} onValueChange={setAspectRatio}>
              <SelectTrigger id="c-ratio">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASPECT_RATIOS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Create campaign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
