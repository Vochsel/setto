"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Layers, X } from "lucide-react";
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
  CommandSeparator,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { BASE_VARIATION_ID } from "@/convex/lib/prompt";
import type { OutfitVariation } from "@/lib/types";

/**
 * Searchable multi-select over an outfit's variations. Each selected variation
 * yields one image, so this stays open across picks — the list is the batch.
 * "Default" (the base outfit, no variation applied) is offered alongside them
 * once there's more than one variation to choose from.
 */
export function VariationMultiSelect({
  variations,
  selected,
  onChange,
}: {
  variations: OutfitVariation[];
  /** Variation ids, possibly including the `__base__` sentinel. */
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const showDefault = variations.length > 1;
  const options: { id: string; name: string; thumb?: string; hint?: string }[] =
    [
      ...(showDefault
        ? [
            {
              id: BASE_VARIATION_ID,
              name: "Default",
              hint: "the original outfit, no variation applied",
            },
          ]
        : []),
      ...variations.map((v) => ({
        id: v.id,
        name: v.name,
        thumb: v.imageUrls?.[0]?.url,
      })),
    ];

  // Selection order is the batch order, but ids no longer on the outfit (a
  // deleted variation still referenced by the shot) shouldn't show up.
  const known = new Set(options.map((o) => o.id));
  const picked = options.filter((o) => selected.includes(o.id));

  function toggle(id: string) {
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected.filter((x) => known.has(x)), id],
    );
  }

  const summary =
    picked.length === 0
      ? "Variations"
      : picked.length <= 2
        ? picked.map((o) => o.name).join(", ")
        : `${picked.length} variations`;

  return (
    <div className="space-y-1.5">
      <span className="text-muted-foreground flex items-center gap-1 text-xs">
        <Layers className="h-3 w-3" /> Variations
        <span className="text-muted-foreground/60">
          · one image each
        </span>
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between gap-2 font-normal",
              picked.length === 0 && "text-muted-foreground",
            )}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {picked.length > 0 && (
                <span className="flex -space-x-1.5">
                  {picked
                    .filter((o) => o.thumb)
                    .slice(0, 3)
                    .map((o) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={o.id}
                        src={o.thumb}
                        alt=""
                        className="border-background size-5 rounded-full border object-cover"
                      />
                    ))}
                </span>
              )}
              <span className="truncate">{summary}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {picked.length > 0 && (
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label="Clear variations"
                  title="Clear variations"
                  className="text-muted-foreground hover:text-foreground -mr-0.5 rounded p-0.5"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange([]);
                  }}
                >
                  <X className="size-3.5" />
                </span>
              )}
              <ChevronsUpDown className="size-4 opacity-50" />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
        >
          <Command>
            <CommandInput placeholder="Search variations…" />
            <CommandList>
              <CommandEmpty>No variations found.</CommandEmpty>
              <CommandGroup>
                {options.map((o) => {
                  const active = selected.includes(o.id);
                  return (
                    <CommandItem
                      key={o.id}
                      value={o.name}
                      onSelect={() => toggle(o.id)}
                      className="gap-2"
                      title={o.hint ?? o.name}
                    >
                      <div
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded border",
                          active
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-muted-foreground/40",
                        )}
                      >
                        {active && <Check className="size-3" />}
                      </div>
                      {o.thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={o.thumb}
                          alt=""
                          className="size-6 shrink-0 rounded object-cover"
                        />
                      ) : null}
                      <span className="truncate">{o.name}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              {picked.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      value="__clear__"
                      onSelect={() => onChange([])}
                      className="text-muted-foreground"
                    >
                      <X className="size-4" /> Clear selection
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
