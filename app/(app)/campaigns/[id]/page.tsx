"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Settings2, Loader2, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmDelete } from "@/components/confirm-delete";
import { CopyPanel } from "@/components/campaign/copy-panel";
import { InspirationPanel } from "@/components/campaign/inspiration-panel";
import { ShotsPanel } from "@/components/campaign/shots-panel";
import { CreativePanel } from "@/components/campaign/creative-panel";
import { campaignStatusMeta, type CampaignStatus } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Id } from "@/convex/_generated/dataModel";

const STATUSES: CampaignStatus[] = ["draft", "active", "archived"];

export default function CampaignEditorPage() {
  const params = useParams<{ id: string }>();
  const campaignId = params.id as Id<"campaigns">;
  const router = useRouter();

  const campaign = useQuery(api.campaigns.get, { id: campaignId });
  const updateCampaign = useMutation(api.campaigns.update);
  const removeCampaign = useMutation(api.campaigns.remove);

  if (campaign === undefined) {
    return (
      <>
        <PageHeader title={<Skeleton className="h-5 w-40" />} />
        <div className="p-6">
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      </>
    );
  }
  if (campaign === null) {
    return (
      <>
        <PageHeader title="Campaign not found" />
        <div className="p-6">
          <Button onClick={() => router.push("/campaigns")}>
            Back to campaigns
          </Button>
        </div>
      </>
    );
  }

  const status = campaignStatusMeta[campaign.status];
  const selectedShots = campaign.selectedShotImages ?? [];

  return (
    <>
      <PageHeader title={campaign.name} description="Campaign">
        <Select
          value={campaign.status}
          onValueChange={(v) =>
            updateCampaign({ id: campaignId, status: v as CampaignStatus })
          }
        >
          <SelectTrigger size="sm" className={cn("w-32", status.className)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {campaignStatusMeta[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <CampaignSettings
          name={campaign.name}
          onSave={(patch) => updateCampaign({ id: campaignId, ...patch })}
          onDelete={async () => {
            await removeCampaign({ id: campaignId });
            toast.success("Campaign deleted");
            router.push("/campaigns");
          }}
        />
      </PageHeader>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 md:p-6 lg:grid-cols-2">
        {/* Left: copy + inspiration */}
        <div className="space-y-4">
          <CopyPanel
            campaignId={campaignId}
            brief={campaign.brief}
            copy={campaign.copy}
            copyVariants={campaign.copyVariants}
          />
          <InspirationPanel
            campaignId={campaignId}
            refs={campaign.inspirationRefs}
            urls={campaign.inspirationUrls}
          />
        </div>

        {/* Right: shots + creatives */}
        <div className="space-y-4">
          <ShotsPanel campaignId={campaignId} selected={selectedShots} />
          <CreativePanel
            campaignId={campaignId}
            aspectRatio={campaign.aspectRatio}
            hasShots={selectedShots.length > 0}
          />
        </div>
      </div>
    </>
  );
}

function CampaignSettings({
  name,
  onSave,
  onDelete,
}: {
  name: string;
  onSave: (patch: { name?: string }) => Promise<unknown>;
  onDelete: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [nameValue, setNameValue] = useState(name);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await onSave({ name: nameValue.trim() || name });
      toast.success("Campaign updated");
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="h-4 w-4" /> Settings
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Campaign settings</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="cs-name">Name</Label>
            <Input
              id="cs-name"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          <ConfirmDelete
            title="Delete this campaign?"
            description="Its creatives will be permanently removed."
            onConfirm={onDelete}
            trigger={
              <Button variant="ghost" className="text-destructive">
                <Trash2 className="h-4 w-4" /> Delete campaign
              </Button>
            }
          />
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
