"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Plus, MapPin, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { LocationPickerDialog } from "@/components/location-picker-dialog";
import type { Id } from "@/convex/_generated/dataModel";

export function AddLocation({
  shootId,
  existingLocationIds,
}: {
  shootId: Id<"shoots">;
  existingLocationIds: string[];
}) {
  const locations = useQuery(api.locations.list, {});
  const addLoc = useMutation(api.shootLocations.add);
  const [open, setOpen] = useState(false);

  async function add(locationId: Id<"locations">) {
    try {
      await addLoc({ shootId, locationId });
      toast.success("Location added to shoot");
      setOpen(false);
    } catch {
      toast.error("Could not add location");
    }
  }

  const total = locations?.length ?? 0;
  const available = locations?.filter(
    (l) => !existingLocationIds.includes(l._id),
  ).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> Add location
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 overflow-hidden p-0" align="end">
        <Command>
          <CommandInput placeholder="Search locations…" />
          <CommandList>
            <CommandEmpty>
              <span className="text-muted-foreground text-sm">
                No locations match.
              </span>
            </CommandEmpty>
            <CommandGroup
              heading={
                total > 0
                  ? `Saved locations${
                      available !== undefined ? ` · ${available} available` : ""
                    }`
                  : "Saved locations"
              }
            >
              {locations?.map((l) => {
                const added = existingLocationIds.includes(l._id);
                return (
                  <CommandItem
                    key={l._id}
                    value={`${l.name} ${l.address ?? ""}`}
                    disabled={added}
                    onSelect={() => add(l._id)}
                    className="gap-2.5 py-2"
                  >
                    <span className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full">
                      <MapPin className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {l.name}
                      </span>
                      {l.address ? (
                        <span className="text-muted-foreground block truncate text-xs">
                          {l.address}
                        </span>
                      ) : null}
                    </span>
                    {added && (
                      <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-[11px]">
                        <Check className="h-3.5 w-3.5" /> Added
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="border-t p-1">
          <LocationPickerDialog
            onCreated={(id) => add(id as Id<"locations">)}
            trigger={
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start font-normal"
              >
                <span className="bg-primary/10 text-primary mr-0.5 flex size-7 items-center justify-center rounded-full">
                  <Plus className="h-3.5 w-3.5" />
                </span>
                Create new location
              </Button>
            }
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
