"use client";

import { useEffect, useRef } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { Input } from "@/components/ui/input";

export interface PickedPlace {
  lat: number;
  lng: number;
  address?: string;
  name?: string;
  placeId?: string;
}

export function PlaceSearch({
  onSelect,
  placeholder,
}: {
  onSelect: (p: PickedPlace) => void;
  placeholder?: string;
}) {
  const places = useMapsLibrary("places");
  const inputRef = useRef<HTMLInputElement>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    if (!places || !inputRef.current) return;
    const ac = new places.Autocomplete(inputRef.current, {
      fields: ["geometry", "formatted_address", "name", "place_id"],
    });
    const listener = ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      const loc = place.geometry?.location;
      if (!loc) return;
      onSelectRef.current({
        lat: loc.lat(),
        lng: loc.lng(),
        address: place.formatted_address ?? undefined,
        name: place.name ?? undefined,
        placeId: place.place_id ?? undefined,
      });
    });
    return () => listener.remove();
  }, [places]);

  return (
    <Input
      ref={inputRef}
      placeholder={placeholder ?? "Search for a place…"}
      onKeyDown={(e) => {
        // Prevent the dialog/form from submitting when choosing a suggestion.
        if (e.key === "Enter") e.preventDefault();
      }}
    />
  );
}
