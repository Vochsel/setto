import type { Id } from "@/convex/_generated/dataModel";
import type { OutfitVariation } from "@/lib/types";

export interface ModelOption {
  _id: Id<"models">;
  name: string;
  promptDescriptor?: string;
  attributes?: Record<string, unknown> | null;
  imageUrls?: { url: string }[];
}

export interface OutfitOption {
  _id: Id<"outfits">;
  name: string;
  promptDescriptor?: string;
  variations?: OutfitVariation[];
}

export interface PresetOption {
  _id: Id<"presets">;
  name: string;
  promptDescriptor?: string;
}

export interface VideoDoc {
  _id: Id<"videos">;
  generationId: Id<"generations">;
  status: "queued" | "generating" | "succeeded" | "failed";
  videoUrl?: string;
  posterUrl?: string;
  modelKey: string;
  modelLabel?: string;
  prompt: string;
  durationSeconds: number;
  progress?: number;
  progressLabel?: string;
  error?: string;
}

export interface GenerationDoc {
  _id: Id<"generations">;
  status: "queued" | "generating" | "succeeded" | "failed";
  imageUrl?: string;
  variationId?: string;
  modelLabel?: string;
  modelKey: string;
  prompt: string;
  progress?: number;
  progressLabel?: string;
  error?: string;
  videos: VideoDoc[];
}

export interface ShotDoc {
  _id: Id<"shots">;
  name?: string;
  order: number;
  shootLocationId: Id<"shootLocations">;
  modelId?: Id<"models">;
  outfitId?: Id<"outfits">;
  selectedVariationIds?: string[];
  posePrompt?: string;
  clothingPrompt?: string;
  extraPrompt?: string;
  styleId?: Id<"presets">;
  cameraId?: Id<"presets">;
  lightingId?: Id<"presets">;
  cameraFraming?: unknown;
  generations: GenerationDoc[];
}

export interface ShootLocationDoc {
  _id: Id<"shootLocations">;
  shootId: Id<"shoots">;
  locationId: Id<"locations">;
  order: number;
  modelIds?: Id<"models">[];
  notes?: string;
  staging?: unknown;
  location: {
    _id: Id<"locations">;
    name: string;
    address?: string;
    promptDescriptor?: string;
    lat?: number;
    lng?: number;
    streetViewUrls?: { url: string; caption?: string }[];
    imageUrls?: { url: string }[];
  } | null;
  models: { _id: Id<"models">; name: string; imageUrls?: { url: string }[] }[];
}

export interface LibraryData {
  models: ModelOption[];
  outfits: OutfitOption[];
  styles: PresetOption[];
  cameras: PresetOption[];
  lightings: PresetOption[];
}
