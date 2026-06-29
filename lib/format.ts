import { format, formatDistanceToNow } from "date-fns";

export function formatDateTime(ts?: number | null): string {
  if (!ts) return "No date set";
  return format(new Date(ts), "EEE d MMM yyyy · HH:mm");
}

export function formatRelative(ts?: number | null): string {
  if (!ts) return "";
  return formatDistanceToNow(new Date(ts), { addSuffix: true });
}

/** USD amount for dashboards — e.g. $0.04, $12.50, $1,240.00. */
export function formatUsd(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: amount < 1 ? 3 : 2,
  });
}

export type UsageKind = "shot" | "model_portrait" | "model_variation";

export const usageKindMeta: Record<UsageKind, string> = {
  shot: "Shot",
  model_portrait: "Model portrait",
  model_variation: "Model variation",
};

export type ShootStatus = "draft" | "active" | "completed" | "archived";

export const shootStatusMeta: Record<
  ShootStatus,
  { label: string; className: string }
> = {
  draft: {
    label: "Draft",
    className: "bg-muted text-muted-foreground border-transparent",
  },
  active: {
    label: "Active",
    className: "bg-primary/15 text-primary border-primary/20",
  },
  completed: {
    label: "Completed",
    className: "bg-chart-5/15 text-chart-5 border-chart-5/20",
  },
  archived: {
    label: "Archived",
    className: "bg-muted text-muted-foreground/70 border-transparent",
  },
};
