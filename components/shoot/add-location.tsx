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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> Add location
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <Command>
          <CommandInput placeholder="Search locations…" />
          <CommandList>
            <CommandEmpty>No saved locations.</CommandEmpty>
            <CommandGroup heading="Saved locations">
              {locations?.map((l) => {
                const added = existingLocationIds.includes(l._id);
                return (
                  <CommandItem
                    key={l._id}
                    value={l.name}
                    disabled={added}
                    onSelect={() => add(l._id)}
                    className="gap-2"
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{l.name}</span>
                    {added && <Check className="ml-auto h-3.5 w-3.5" />}
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
              <Button variant="ghost" className="w-full justify-start">
                <Plus className="h-4 w-4" /> Create new location
              </Button>
            }
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
