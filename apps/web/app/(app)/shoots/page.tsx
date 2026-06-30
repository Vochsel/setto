"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Plus, Clapperboard } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { NewShootDialog } from "@/components/new-shoot-dialog";
import { ShootCard } from "@/components/shoot-card";
import type { ShootStatus } from "@/lib/format";

const FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

export default function ShootsPage() {
  const [filter, setFilter] = useState<string>("all");
  const shoots = useQuery(
    api.shoots.list,
    filter === "all" ? {} : { status: filter as ShootStatus },
  );

  return (
    <>
      <PageHeader title="Shoots" description="Plan and produce your shoots">
        <NewShootDialog
          trigger={
            <Button>
              <Plus className="h-4 w-4" /> New shoot
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

        {shoots === undefined ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        ) : shoots.length === 0 ? (
          <EmptyState
            icon={Clapperboard}
            title="No shoots here"
            description="Create a shoot to start adding locations, models and shots."
            action={
              <NewShootDialog
                trigger={
                  <Button>
                    <Plus className="h-4 w-4" /> New shoot
                  </Button>
                }
              />
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shoots.map((s) => (
              <ShootCard key={s._id} shoot={s} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
