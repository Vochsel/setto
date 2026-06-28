import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * A reference image — either an uploaded file (Convex storage) or an external
 * URL (e.g. a Google Street View capture). `source` records provenance.
 */
export const imageRef = v.object({
  storageId: v.optional(v.id("_storage")),
  url: v.optional(v.string()),
  caption: v.optional(v.string()),
  source: v.optional(v.string()), // "upload" | "street_view" | "places" | "web"
});

/**
 * An outfit variation (e.g. a colorway or alternate styling). Variations are
 * embedded in the outfit doc and referenced by id from shots, so a single shot
 * can fan out one generation per selected variation.
 */
export const outfitVariation = v.object({
  id: v.string(), // nanoid, stable within the outfit
  name: v.string(),
  promptDescriptor: v.optional(v.string()),
  images: v.optional(v.array(imageRef)),
});

export default defineSchema({
  // --- Identity (synced from WorkOS) -------------------------------------
  users: defineTable({
    workosId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    lastSeenAt: v.optional(v.number()),
  }).index("by_workos_id", ["workosId"]),

  // Cache of org names so we can render the team switcher nicely.
  organizations: defineTable({
    workosOrgId: v.string(),
    name: v.optional(v.string()),
  }).index("by_workos_org_id", ["workosOrgId"]),

  // Per-workspace preferences (shared across the team).
  settings: defineTable({
    orgId: v.string(),
    defaultImageModelKey: v.optional(v.string()),
  }).index("by_org", ["orgId"]),

  // --- Library: people ----------------------------------------------------
  models: defineTable({
    orgId: v.string(), // scope key: WorkOS org id, or "user:<id>" for solo
    createdBy: v.string(), // WorkOS user id
    name: v.string(),
    description: v.optional(v.string()),
    promptDescriptor: v.optional(v.string()), // injected into the final prompt
    attributes: v.optional(v.any()), // freeform: age, build, hair, etc.
    images: v.optional(v.array(imageRef)),
    archived: v.optional(v.boolean()),
  }).index("by_org", ["orgId"]),

  // --- Library: locations -------------------------------------------------
  locations: defineTable({
    orgId: v.string(),
    createdBy: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    promptDescriptor: v.optional(v.string()),
    address: v.optional(v.string()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    googlePlaceId: v.optional(v.string()),
    // Captured real-world references used to ground the backdrop.
    streetViewRefs: v.optional(v.array(imageRef)),
    images: v.optional(v.array(imageRef)),
    archived: v.optional(v.boolean()),
  }).index("by_org", ["orgId"]),

  // --- Library: outfits (with embedded variations) ------------------------
  outfits: defineTable({
    orgId: v.string(),
    createdBy: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    promptDescriptor: v.optional(v.string()),
    images: v.optional(v.array(imageRef)),
    variations: v.optional(v.array(outfitVariation)),
    archived: v.optional(v.boolean()),
  }).index("by_org", ["orgId"]),

  // --- Library: presets (photography style / camera / lighting) -----------
  presets: defineTable({
    orgId: v.string(),
    createdBy: v.string(),
    type: v.union(
      v.literal("photography_style"),
      v.literal("camera_setup"),
      v.literal("lighting"),
    ),
    name: v.string(),
    description: v.optional(v.string()),
    promptDescriptor: v.optional(v.string()),
    params: v.optional(v.any()),
    archived: v.optional(v.boolean()),
  })
    .index("by_org", ["orgId"])
    .index("by_org_type", ["orgId", "type"]),

  // --- Shoots -------------------------------------------------------------
  shoots: defineTable({
    orgId: v.string(),
    createdBy: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("active"),
      v.literal("completed"),
      v.literal("archived"),
    ),
    scheduledAt: v.optional(v.number()), // unix ms — date & time
    timezone: v.optional(v.string()),
    coverImage: v.optional(imageRef),
  })
    .index("by_org", ["orgId"])
    .index("by_org_status", ["orgId", "status"]),

  // A location used within a shoot. Holds which models are present and the
  // optional 3D staging scene.
  shootLocations: defineTable({
    orgId: v.string(),
    shootId: v.id("shoots"),
    locationId: v.id("locations"),
    order: v.number(),
    modelIds: v.optional(v.array(v.id("models"))), // models present here
    notes: v.optional(v.string()),
    // Three.js staging scene (models, cameras, lights, backdrop). Kept flexible
    // because the 3D format evolves independently of the DB.
    staging: v.optional(v.any()),
  })
    .index("by_shoot", ["shootId"])
    .index("by_org", ["orgId"]),

  // A "shot" (renamed from "take"): a recipe of model + outfit (+ selected
  // variations) + pose/style/camera that produces one or more generations.
  shots: defineTable({
    orgId: v.string(),
    shootId: v.id("shoots"),
    shootLocationId: v.id("shootLocations"),
    order: v.number(),
    name: v.optional(v.string()),
    modelId: v.optional(v.id("models")),
    outfitId: v.optional(v.id("outfits")),
    selectedVariationIds: v.optional(v.array(v.string())), // empty => base outfit
    posePrompt: v.optional(v.string()),
    extraPrompt: v.optional(v.string()),
    styleId: v.optional(v.id("presets")), // photography_style
    cameraId: v.optional(v.id("presets")), // camera_setup
    lightingId: v.optional(v.id("presets")), // lighting
    // Camera framing exported from the 3D staging step.
    cameraFraming: v.optional(v.any()),
  })
    .index("by_shoot_location", ["shootLocationId"])
    .index("by_shoot", ["shootId"])
    .index("by_org", ["orgId"]),

  // --- Generations --------------------------------------------------------
  generations: defineTable({
    orgId: v.string(),
    createdBy: v.string(),
    shotId: v.id("shots"),
    shootId: v.id("shoots"),
    variationId: v.optional(v.string()), // which outfit variation (null => base)
    provider: v.string(), // "fal"
    modelKey: v.string(), // e.g. "fal-ai/flux-pro/v1.1", "fal-ai/gpt-image-1"
    modelLabel: v.optional(v.string()),
    prompt: v.string(),
    negativePrompt: v.optional(v.string()),
    status: v.union(
      v.literal("queued"),
      v.literal("generating"),
      v.literal("succeeded"),
      v.literal("failed"),
    ),
    imageUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    seed: v.optional(v.number()),
    params: v.optional(v.any()),
    falRequestId: v.optional(v.string()),
    error: v.optional(v.string()),
  })
    .index("by_shot", ["shotId"])
    .index("by_shoot", ["shootId"])
    .index("by_org", ["orgId"])
    .index("by_status", ["status"]),
});
