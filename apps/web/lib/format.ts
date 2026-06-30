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

export type UsageKind =
  | "shot"
  | "model_portrait"
  | "model_sheet"
  | "model_variation"
  | "campaign_copy"
  | "campaign_creative"
  | "video";

export const usageKindMeta: Record<UsageKind, string> = {
  shot: "Shot",
  model_portrait: "Model portrait",
  model_sheet: "Model sheet",
  model_variation: "Model variation",
  campaign_copy: "Campaign copy",
  campaign_creative: "Campaign creative",
  video: "Video",
};

export type CampaignStatus = "draft" | "active" | "archived";

export const campaignStatusMeta: Record<
  CampaignStatus,
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
  archived: {
    label: "Archived",
    className: "bg-muted text-muted-foreground/70 border-transparent",
  },
};

/** Aspect-ratio options offered for campaign creatives. */
export const ASPECT_RATIOS: { value: string; label: string }[] = [
  { value: "1:1", label: "1:1 — Square" },
  // Portrait (taller than wide)
  { value: "4:5", label: "4:5 — Portrait" },
  { value: "3:4", label: "3:4 — Portrait" },
  { value: "2:3", label: "2:3 — Portrait" },
  { value: "9:16", label: "9:16 — Portrait (tall / story)" },
  // Landscape (wider than tall)
  { value: "5:4", label: "5:4 — Landscape" },
  { value: "4:3", label: "4:3 — Landscape" },
  { value: "3:2", label: "3:2 — Landscape" },
  { value: "16:9", label: "16:9 — Landscape (wide)" },
];

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
