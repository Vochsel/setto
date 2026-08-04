"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Plus, Workflow, Copy, Package, Users, MapPin } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Trash2 } from "lucide-react";
import { formatRelative } from "@/lib/format";
import type { Id } from "@/convex/_generated/dataModel";

export default function FlowsPage() {
  const flows = useQuery(api.flows.list, {});
  const create = useMutation(api.flows.create);
  const duplicate = useMutation(api.flows.duplicate);
  const remove = useMutation(api.flows.remove);
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function newFlow() {
    setCreating(true);
    try {
      const id = await create({ name: "Untitled flow", graph: emptyGraph() });
      router.push(`/flows/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create flow");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Flows"
        description="Reusable shot templates — wire products, people and places, then run them on demand"
      >
        <Button onClick={newFlow} disabled={creating}>
          <Plus className="h-4 w-4" /> New flow
        </Button>
      </PageHeader>

      <div className="p-4 md:p-6">
        {flows === undefined ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ) : flows.length === 0 ? (
          <EmptyState
            icon={Workflow}
            title="No flows yet"
            description="A flow wires a product (and its variants) to the people and places you want it shot with. Run it whenever the product changes — or point it at a new arrival and get the same look."
            action={
              <Button onClick={newFlow} disabled={creating}>
                <Plus className="h-4 w-4" /> New flow
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {flows.map((f) => (
              <Card key={f._id} className="group relative gap-3 p-4">
                <Link href={`/flows/${f._id}`} className="min-w-0">
                  <h3 className="truncate text-sm font-medium">{f.name}</h3>
                  {f.description ? (
                    <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                      {f.description}
                    </p>
                  ) : null}
                </Link>

                <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge variant="secondary" className="gap-1 font-normal">
                    <Package className="h-3 w-3" /> {f.nodes.products}
                  </Badge>
                  <Badge variant="secondary" className="gap-1 font-normal">
                    <Users className="h-3 w-3" /> {f.nodes.models}
                  </Badge>
                  <Badge variant="secondary" className="gap-1 font-normal">
                    <MapPin className="h-3 w-3" /> {f.nodes.locations}
                  </Badge>
                  {f.lastRunAt ? (
                    <span className="ml-auto">
                      ran {formatRelative(f.lastRunAt)}
                    </span>
                  ) : (
                    <span className="ml-auto">never run</span>
                  )}
                </div>

                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    title="Duplicate"
                    onClick={async () => {
                      await duplicate({ id: f._id as Id<"flows"> });
                      toast.success("Flow duplicated");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <ConfirmDelete
                    title="Delete this flow?"
                    onConfirm={async () => {
                      await remove({ id: f._id as Id<"flows"> });
                      toast.success("Flow deleted");
                    }}
                    trigger={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive size-7"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    }
                  />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/** A new flow starts with one output node — there's nothing to run without it. */
function emptyGraph() {
  return {
    nodes: [
      {
        id: "output-1",
        type: "output",
        position: { x: 420, y: 160 },
        data: { count: 1 },
      },
    ],
    edges: [],
  };
}
