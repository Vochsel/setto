"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { FolderInput, Loader2, ArrowRight, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Id } from "@/convex/_generated/dataModel";

export interface ShootLocationTarget {
  shootLocationId: Id<"shootLocations">;
  locationId: Id<"locations">;
  name: string;
}

export interface LibraryLocationTarget {
  locationId: Id<"locations">;
  name: string;
}

/**
 * Move or duplicate a shot to another location. Targets are the shoot's other
 * locations, plus any library location not yet in the shoot ("new") — picking
 * the latter adds it to the shoot first, then moves / duplicates into it.
 */
export function MoveShotMenu({
  shotId,
  shootId,
  currentShootLocationId,
  shootLocations,
  libraryLocations,
}: {
  shotId: Id<"shots">;
  shootId: Id<"shoots">;
  currentShootLocationId: Id<"shootLocations">;
  shootLocations: ShootLocationTarget[];
  libraryLocations: LibraryLocationTarget[];
}) {
  const move = useMutation(api.shots.move);
  const duplicate = useMutation(api.shots.duplicate);
  const addLoc = useMutation(api.shootLocations.add);

  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // Existing stops in this shoot, minus the one this shot already lives in.
  const inShoot = shootLocations.filter(
    (l) => l.shootLocationId !== currentShootLocationId,
  );
  // Library locations not already part of the shoot (would be added on use).
  const inShootLocationIds = new Set(shootLocations.map((l) => l.locationId));
  const fromLibrary = libraryLocations.filter(
    (l) => !inShootLocationIds.has(l.locationId),
  );

  const hasTargets = inShoot.length > 0 || fromLibrary.length > 0;

  /** Resolve the picked option to a shootLocationId, adding to the shoot if it
   * is a library-only location ("new"). */
  async function resolveTarget(): Promise<Id<"shootLocations"> | null> {
    if (target.startsWith("sl:")) {
      return target.slice(3) as Id<"shootLocations">;
    }
    if (target.startsWith("lib:")) {
      const locationId = target.slice(4) as Id<"locations">;
      return (await addLoc({ shootId, locationId })) as Id<"shootLocations">;
    }
    return null;
  }

  async function run(kind: "move" | "duplicate") {
    if (!target) {
      toast.error("Pick a location first");
      return;
    }
    setBusy(true);
    try {
      const shootLocationId = await resolveTarget();
      if (!shootLocationId) return;
      if (kind === "move") {
        await move({ id: shotId, shootLocationId });
        toast.success("Shot moved");
      } else {
        await duplicate({ id: shotId, shootLocationId });
        toast.success("Shot duplicated");
      }
      setOpen(false);
      setTarget("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not move shot");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          title="Move or copy to another location"
          className="text-muted-foreground hover:text-foreground size-7 shrink-0"
        >
          <FolderInput className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3" align="end">
        <p className="text-xs font-medium">Move or copy to location</p>
        {hasTargets ? (
          <>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger size="sm" className="w-full min-w-0">
                <SelectValue placeholder="Choose a location…" />
              </SelectTrigger>
              <SelectContent>
                {inShoot.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>In this shoot</SelectLabel>
                    {inShoot.map((l) => (
                      <SelectItem
                        key={l.shootLocationId}
                        value={`sl:${l.shootLocationId}`}
                      >
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {fromLibrary.length > 0 && (
                  <SelectGroup>
                    {inShoot.length > 0 && <SelectSeparator />}
                    <SelectLabel>Add from library</SelectLabel>
                    {fromLibrary.map((l) => (
                      <SelectItem key={l.locationId} value={`lib:${l.locationId}`}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => run("move")}
                disabled={busy || !target}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowRight className="h-3.5 w-3.5" />
                )}
                Move
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={() => run("duplicate")}
                disabled={busy || !target}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                Duplicate
              </Button>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground text-xs">
            No other locations yet. Add another location to the shoot to move or
            copy shots between them.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
