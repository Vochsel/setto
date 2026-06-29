"use client";

import { Check, UserPlus } from "lucide-react";
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
import { cn } from "@/lib/utils";

export interface ModelOption {
  _id: string;
  name: string;
  imageUrls?: { url: string }[];
}

export function ModelMultiSelect({
  models,
  selected,
  onChange,
}: {
  models: ModelOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string) {
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus className="h-4 w-4" />
          {selected.length ? `${selected.length} model${selected.length === 1 ? "" : "s"}` : "Add models"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search models…" />
          <CommandList>
            <CommandEmpty>No models found.</CommandEmpty>
            <CommandGroup>
              {models.map((m) => {
                const active = selected.includes(m._id);
                return (
                  <CommandItem
                    key={m._id}
                    value={m.name}
                    onSelect={() => toggle(m._id)}
                    className="gap-2"
                  >
                    <div
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded border",
                        active
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-muted-foreground/40",
                      )}
                    >
                      {active && <Check className="h-3 w-3" />}
                    </div>
                    {m.imageUrls?.[0]?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.imageUrls[0].url}
                        alt=""
                        className="h-6 w-6 rounded object-cover"
                      />
                    ) : null}
                    <span className="truncate">{m.name}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
