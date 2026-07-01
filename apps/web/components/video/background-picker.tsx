"use client";

import { useState } from "react";
import { Loader2, ImagePlus, X } from "lucide-react";
import { BACKGROUND_GRADIENTS } from "@setto/core/video";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const COLORS = [
  "#000000",
  "#111111",
  "#1e293b",
  "#0f172a",
  "#ffffff",
  "#7c3aed",
  "#db2777",
  "#0ea5e9",
  "#f59e0b",
  "#10b981",
];

export type BackgroundValue = {
  background?: string;
  backgroundGradient?: string;
  backgroundImageUrl?: string;
};

export type BackgroundPatch = {
  background?: string | null;
  backgroundGradient?: string | null;
  backgroundImageUrl?: string | null;
};

export function BackgroundPicker({
  value,
  onChange,
  onUpload,
}: {
  value: BackgroundValue;
  onChange: (patch: BackgroundPatch) => void;
  /** Upload a file, returning a durable URL (or undefined on failure). */
  onUpload: (file: File) => Promise<string | undefined>;
}) {
  const [uploading, setUploading] = useState(false);
  const mode = value.backgroundImageUrl
    ? "image"
    : value.backgroundGradient
      ? "gradient"
      : "color";

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const url = await onUpload(file);
      if (url)
        onChange({
          backgroundImageUrl: url,
          backgroundGradient: null,
        });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Tabs value={mode} className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger
          value="color"
          onClick={() =>
            onChange({
              background: value.background ?? "#000000",
              backgroundGradient: null,
              backgroundImageUrl: null,
            })
          }
        >
          Color
        </TabsTrigger>
        <TabsTrigger
          value="gradient"
          onClick={() =>
            onChange({
              backgroundGradient:
                value.backgroundGradient ?? BACKGROUND_GRADIENTS[0].css,
              backgroundImageUrl: null,
            })
          }
        >
          Gradient
        </TabsTrigger>
        <TabsTrigger value="image">Image</TabsTrigger>
      </TabsList>

      <TabsContent value="color" className="mt-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() =>
                onChange({
                  background: c,
                  backgroundGradient: null,
                  backgroundImageUrl: null,
                })
              }
              className={cn(
                "size-6 rounded-full border shadow-sm transition",
                value.background === c && mode === "color"
                  ? "ring-foreground ring-2 ring-offset-1"
                  : "hover:scale-110",
              )}
              style={{ background: c }}
              aria-label={c}
            />
          ))}
          <label
            className="border-input hover:border-foreground/40 relative size-6 cursor-pointer overflow-hidden rounded-full border"
            title="Custom color"
            style={{
              background:
                "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)",
            }}
          >
            <input
              type="color"
              value={value.background ?? "#000000"}
              onChange={(e) =>
                onChange({
                  background: e.target.value,
                  backgroundGradient: null,
                  backgroundImageUrl: null,
                })
              }
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        </div>
      </TabsContent>

      <TabsContent value="gradient" className="mt-2">
        <div className="grid grid-cols-4 gap-1.5">
          {BACKGROUND_GRADIENTS.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() =>
                onChange({
                  backgroundGradient: g.css,
                  backgroundImageUrl: null,
                })
              }
              title={g.label}
              className={cn(
                "h-9 rounded-md border shadow-sm transition",
                value.backgroundGradient === g.css
                  ? "ring-foreground ring-2 ring-offset-1"
                  : "hover:scale-[1.03]",
              )}
              style={{ background: g.css }}
              aria-label={g.label}
            />
          ))}
        </div>
      </TabsContent>

      <TabsContent value="image" className="mt-2">
        {value.backgroundImageUrl ? (
          <div className="relative overflow-hidden rounded-md border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value.backgroundImageUrl}
              alt="Background"
              className="h-24 w-full object-cover"
            />
            <button
              type="button"
              onClick={() => onChange({ backgroundImageUrl: null })}
              className="bg-background/90 text-muted-foreground hover:text-destructive absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full border shadow-sm"
              aria-label="Remove background image"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <label className="hover:border-foreground/30 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-2 py-3 text-sm">
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="h-4 w-4" />
            )}
            Upload image
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
          </label>
        )}
      </TabsContent>
    </Tabs>
  );
}
