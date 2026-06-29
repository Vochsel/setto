"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Megaphone, Image as ImageIcon, Camera } from "lucide-react";
import { campaignStatusMeta, type CampaignStatus } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface CampaignCardData {
  _id: string;
  name: string;
  brief?: string;
  status: CampaignStatus;
  shotCount?: number;
  creativeCount?: number;
  recentImages?: string[];
}

/** Crossfades through the campaign's most recent creatives. */
function Slideshow({ images }: { images: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (images.length <= 1) return;
    const id = setInterval(
      () => setI((prev) => (prev + 1) % images.length),
      3500,
    );
    return () => clearInterval(id);
  }, [images.length]);

  return (
    <div className="absolute inset-0">
      {images.map((src, idx) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={idx}
          src={src}
          alt=""
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-1000",
            idx === i ? "opacity-100" : "opacity-0",
          )}
        />
      ))}
    </div>
  );
}

export function CampaignCard({ campaign }: { campaign: CampaignCardData }) {
  const status = campaignStatusMeta[campaign.status];
  const photos = campaign.recentImages ?? [];
  const statusPill =
    campaign.status === "active"
      ? "bg-[#c1fbd4] text-black dark:bg-white/15 dark:text-white"
      : "bg-black/[0.08] text-black/70 dark:bg-white/10 dark:text-white/70";

  return (
    <Link href={`/campaigns/${campaign._id}`} className="group block">
      <div className="dark:highlight-inset overflow-hidden rounded-xl border border-[#e4e4e7] bg-white shadow-soft transition-transform group-hover:-translate-y-0.5 dark:border-[#1e2c31] dark:bg-[#0a0a0a] dark:shadow-none">
        <div className="relative aspect-[4/5] overflow-hidden bg-[#f0f0ea] dark:bg-black">
          {photos.length ? (
            <>
              <Slideshow images={photos} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <Megaphone className="h-8 w-8 text-black/15 dark:text-white/20" />
            </div>
          )}
          <span
            className={cn(
              "absolute left-3 top-3 rounded-full px-3 py-0.5 text-[11px] font-medium uppercase tracking-[0.04em] backdrop-blur",
              statusPill,
            )}
          >
            {status.label}
          </span>
        </div>

        <div className="p-4">
          <h3 className="truncate text-lg font-light tracking-tight">
            {campaign.name}
          </h3>
          {campaign.brief ? (
            <p className="mt-1 line-clamp-1 text-[13px] text-[#71717a] dark:text-[#a1a1aa]">
              {campaign.brief}
            </p>
          ) : null}
          <div className="mt-3 flex items-center gap-4 text-[13px] text-[#71717a] dark:text-[#a1a1aa]">
            <span className="flex items-center gap-1">
              <Camera className="h-3 w-3" /> {campaign.shotCount ?? 0} shots
            </span>
            <span className="flex items-center gap-1">
              <ImageIcon className="h-3 w-3" /> {campaign.creativeCount ?? 0}{" "}
              creatives
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
