"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import {
  Activity,
  DollarSign,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getImageModel, formatPrice } from "@/convex/lib/imageModels";
import { getVideoModel } from "@/convex/lib/videoModels";
import {
  formatUsd,
  formatRelative,
  usageKindMeta,
  type UsageKind,
} from "@/lib/format";
import { cn } from "@/lib/utils";

function modelName(modelKey: string, modelLabel?: string) {
  return (
    modelLabel ??
    getImageModel(modelKey)?.label ??
    getVideoModel(modelKey)?.label ??
    modelKey
  );
}

/** Per-unit price hint for a model row: "$0.04/img" or "$0.07/s". */
function unitPrice(modelKey: string): string | null {
  const img = getImageModel(modelKey);
  if (img) return `${formatPrice(img.pricePerImage)}/img`;
  const vid = getVideoModel(modelKey);
  if (vid) return `${formatPrice(vid.pricePerSecond)}/s`;
  return null;
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Activity;
  label: string;
  value: string | number | undefined;
  hint?: string;
}) {
  return (
    <Card className="gap-2 p-4">
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      {value === undefined ? (
        <Skeleton className="h-8 w-20" />
      ) : (
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      )}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </Card>
  );
}

function StatusBadge({ status }: { status: "succeeded" | "failed" }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1",
        status === "succeeded"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      {status === "succeeded" ? "Succeeded" : "Failed"}
    </Badge>
  );
}

export default function UsagePage() {
  const router = useRouter();
  const summary = useQuery(api.usage.summary, {});
  const recent = useQuery(api.usage.recent, { limit: 100 });

  const successRate =
    summary && summary.totalEvents > 0
      ? Math.round((summary.succeeded / summary.totalEvents) * 100)
      : undefined;

  return (
    <>
      <PageHeader
        title="Usage"
        description="Team generations, estimated spend and a full audit log"
      />

      <div className="space-y-6 p-4 md:p-6">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            icon={Activity}
            label="Generations"
            value={summary?.totalEvents}
            hint={
              summary
                ? `${summary.succeeded} succeeded · ${summary.failed} failed`
                : undefined
            }
          />
          <StatCard
            icon={DollarSign}
            label="Estimated spend"
            value={summary ? formatUsd(summary.totalCost) : undefined}
            hint="All time, estimated"
          />
          <StatCard
            icon={CalendarClock}
            label="Last 30 days"
            value={summary ? formatUsd(summary.recentCost) : undefined}
            hint="Estimated spend"
          />
          <StatCard
            icon={CheckCircle2}
            label="Success rate"
            value={successRate === undefined ? undefined : `${successRate}%`}
          />
        </div>

        {summary && summary.totalEvents === 0 ? (
          <EmptyState
            icon={Activity}
            title="No usage yet"
            description="Generate images in a shoot or create model portraits — every generation across the product is tracked here."
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* By model */}
            <Card className="gap-0 p-0">
              <div className="border-b p-4">
                <h2 className="text-sm font-medium">Spend by model</h2>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Images</TableHead>
                    <TableHead className="text-right">Est. cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary?.byModel.map((m) => (
                    <TableRow key={m.modelKey}>
                      <TableCell className="font-medium">
                        {modelName(m.modelKey, m.modelLabel)}
                        {unitPrice(m.modelKey) ? (
                          <span className="text-muted-foreground ml-1 text-xs">
                            ~{unitPrice(m.modelKey)}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatUsd(m.cost)}
                      </TableCell>
                    </TableRow>
                  )) ??
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={3}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </Card>

            {/* By member */}
            <Card className="gap-0 p-0">
              <div className="border-b p-4">
                <h2 className="text-sm font-medium">By team member</h2>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead className="text-right">Images</TableHead>
                    <TableHead className="text-right">Est. cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary?.byUser.map((u) => (
                    <TableRow key={u.userId}>
                      <TableCell className="font-medium">
                        {u.name ?? u.email ?? "Unknown"}
                        {u.email && u.name ? (
                          <span className="text-muted-foreground ml-1 text-xs">
                            {u.email}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {u.count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatUsd(u.cost)}
                      </TableCell>
                    </TableRow>
                  )) ??
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={3}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        )}

        {/* Audit log */}
        {(summary === undefined || summary.totalEvents > 0) && (
          <Card className="gap-0 p-0">
            <div className="border-b p-4">
              <h2 className="text-sm font-medium">Audit log</h2>
              <p className="text-muted-foreground text-xs">
                Every generation across shoots and the model studio, newest
                first.
              </p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Member</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent === undefined
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell colSpan={6}>
                            <Skeleton className="h-5 w-full" />
                          </TableCell>
                        </TableRow>
                      ))
                    : recent.map((e) => (
                        <TableRow
                          key={e._id}
                          onClick={() =>
                            e.shootId &&
                            router.push(
                              `/shoots/${e.shootId}${
                                e.shotId ? `?shot=${e.shotId}` : ""
                              }`,
                            )
                          }
                          title={e.shootId ? "Open source shot" : undefined}
                          className={cn(
                            e.shootId && "hover:bg-muted/50 cursor-pointer",
                          )}
                        >
                          <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
                            {formatRelative(e._creationTime)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {e.userName ?? e.userEmail ?? "Unknown"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {e.shootId ? (
                              <span className="text-primary flex items-center gap-0.5">
                                {usageKindMeta[e.kind as UsageKind] ?? e.kind}
                                <ChevronRight className="h-3.5 w-3.5" />
                              </span>
                            ) : (
                              (usageKindMeta[e.kind as UsageKind] ?? e.kind)
                            )}
                          </TableCell>
                          <TableCell
                            className="max-w-48 truncate"
                            title={e.error ?? undefined}
                          >
                            {modelName(e.modelKey, e.modelLabel)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={e.status} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatUsd(e.cost)}
                          </TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
