"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Plus, Megaphone } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { NewCampaignDialog } from "@/components/new-campaign-dialog";
import { CampaignCard } from "@/components/campaign-card";
import type { CampaignStatus } from "@/lib/format";

const FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

export default function CampaignsPage() {
  const [filter, setFilter] = useState<string>("all");
  const campaigns = useQuery(
    api.campaigns.list,
    filter === "all" ? {} : { status: filter as CampaignStatus },
  );

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Turn your shoots into finished ad creatives"
      >
        <NewCampaignDialog
          trigger={
            <Button>
              <Plus className="h-4 w-4" /> New campaign
            </Button>
          }
        />
      </PageHeader>

      <div className="space-y-4 p-4 md:p-6">
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            {FILTERS.map((f) => (
              <TabsTrigger key={f.value} value={f.value}>
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {campaigns === undefined ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="No campaigns here"
            description="Create a campaign to write copy, add inspiration, pick shots and generate ads."
            action={
              <NewCampaignDialog
                trigger={
                  <Button>
                    <Plus className="h-4 w-4" /> New campaign
                  </Button>
                }
              />
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {campaigns.map((c) => (
              <CampaignCard key={c._id} campaign={c} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
