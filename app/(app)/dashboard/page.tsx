"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { NewShootDialog } from "@/components/new-shoot-dialog";
import { ShootCard } from "@/components/shoot-card";
import { GalleryGrid } from "@/components/gallery-grid";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Plus,
  Clapperboard,
  Users,
  Shirt,
  MapPin,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";

// Pill button vocabulary (DESIGN.md): solid-black pill on the light/cream
// track, white-outline pill on the cinematic dark track.
const PILL_PRIMARY =
  "h-10 rounded-full bg-black px-6 text-white shadow-none hover:bg-neutral-800 dark:border dark:border-white/80 dark:bg-transparent dark:text-white dark:hover:bg-white/10";
const PILL_OUTLINE =
  "h-10 rounded-full border border-black/15 bg-transparent px-6 text-black hover:bg-black/5 dark:border-white/25 dark:text-white dark:hover:bg-white/10";

function StatCard({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: number | undefined;
  href: string;
}) {
  return (
    <Link href={href} className="group/stat block">
      <div className="dark:highlight-inset relative flex h-full min-h-[8.5rem] flex-col overflow-hidden rounded-xl border border-[#e4e4e7] bg-white p-6 shadow-soft transition-transform group-hover/stat:-translate-y-0.5 dark:border-[#1e2c31] dark:bg-[#0a0a0a] dark:shadow-none">
        <div className="flex items-center justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#c1fbd4] text-black dark:bg-white/10 dark:text-white">
            <Icon className="h-4 w-4" />
          </div>
          <ArrowUpRight className="h-4 w-4 text-[#a1a1aa] opacity-0 transition-opacity group-hover/stat:opacity-100" />
        </div>
        {value === undefined ? (
          <Skeleton className="mt-auto h-10 w-12" />
        ) : (
          <p className="mt-auto text-4xl font-light tracking-tight tabular-nums">
            {value}
          </p>
        )}
        <p className="mt-1 text-[12px] uppercase tracking-[0.72px] text-[#71717a] dark:text-[#a1a1aa]">
          {label}
        </p>
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const shoots = useQuery(api.shoots.list, {});
  const models = useQuery(api.models.list, {});
  const outfits = useQuery(api.outfits.list, {});
  const locations = useQuery(api.locations.list, {});

  const recent = shoots?.slice(0, 6) ?? [];

  return (
    <div className="font-inter ss03 min-h-full bg-[#fbfbf5] text-black dark:bg-black dark:text-white">
      {/* Slim chrome bar — keeps the sidebar toggle, drops the heavy header. */}
      <div className="flex h-12 items-center gap-2 px-4 md:px-8">
        <SidebarTrigger className="-ml-1" />
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-16 md:px-8">
        {/* Hero */}
        <section className="py-8 md:py-12">
          <p className="text-[12px] uppercase tracking-[0.72px] text-[#71717a] dark:text-[#a1a1aa]">
            Your studio
          </p>
          <h1 className="mt-3 text-5xl font-light leading-none tracking-tight md:text-7xl">
            Dashboard
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-[#3f3f46] dark:text-[#a1a1aa]">
            Plan AI photo shoots in real places — your shoots, models, outfits
            and the latest generations, all in one view.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <NewShootDialog
              trigger={
                <Button className={PILL_PRIMARY}>
                  <Plus className="h-4 w-4" /> New shoot
                </Button>
              }
            />
            <Button asChild className={PILL_OUTLINE} variant="outline">
              <Link href="/models">Manage models</Link>
            </Button>
          </div>
        </section>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            icon={Clapperboard}
            label="Shoots"
            value={shoots?.length}
            href="/shoots"
          />
          <StatCard
            icon={Users}
            label="Models"
            value={models?.length}
            href="/models"
          />
          <StatCard
            icon={Shirt}
            label="Outfits"
            value={outfits?.length}
            href="/outfits"
          />
          <StatCard
            icon={MapPin}
            label="Locations"
            value={locations?.length}
            href="/locations"
          />
        </div>

        {/* Recent shoots / Gallery */}
        <Tabs defaultValue="shoots" className="mt-12">
          <div className="flex items-center justify-between">
            <TabsList className="bg-black/[0.06] dark:bg-white/[0.06]">
              <TabsTrigger value="shoots">Recent shoots</TabsTrigger>
              <TabsTrigger value="gallery">Gallery</TabsTrigger>
            </TabsList>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="rounded-full text-black/70 hover:text-black dark:text-white/70 dark:hover:text-white"
            >
              <Link href="/shoots">
                View all <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>

          <TabsContent value="shoots" className="mt-5">
            {shoots === undefined ? (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-96 rounded-xl" />
                ))}
              </div>
            ) : recent.length === 0 ? (
              <EmptyState
                icon={Clapperboard}
                title="No shoots yet"
                description="Create your first shoot to start planning locations, models and shots."
                action={
                  <NewShootDialog
                    trigger={
                      <Button className={PILL_PRIMARY}>
                        <Plus className="h-4 w-4" /> New shoot
                      </Button>
                    }
                  />
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {recent.map((s) => (
                  <ShootCard key={s._id} shoot={s} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="gallery" className="mt-5">
            <GalleryGrid />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
