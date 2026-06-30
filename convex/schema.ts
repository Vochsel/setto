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

/**
 * Ad copy for a campaign — the words that go on the creative. Every field is
 * optional so the user (or GPT) can fill in as much or as little as they like.
 */
export const adCopy = v.object({
  headline: v.optional(v.string()),
  tagline: v.optional(v.string()),
  body: v.optional(v.string()),
  cta: v.optional(v.string()), // call to action, e.g. "Shop now"
});

/** A GPT-generated copy suggestion the user can apply to the working copy. */
export const copyVariant = v.object({
  id: v.string(), // nanoid, stable within the campaign
  headline: v.optional(v.string()),
  tagline: v.optional(v.string()),
  body: v.optional(v.string()),
  cta: v.optional(v.string()),
  // Which persona/angle agent produced this variant, and any web sources it
  // leaned on (when research used live web search).
  personaId: v.optional(v.string()),
  personaName: v.optional(v.string()),
  sources: v.optional(v.array(v.string())),
});

/** A target-audience persona derived by the research/strategist step. */
export const persona = v.object({
  id: v.string(), // nanoid, stable within the campaign
  name: v.string(),
  descriptor: v.optional(v.string()), // who they are, one line
  motivation: v.optional(v.string()), // what they want
  pains: v.optional(v.string()), // what frustrates them
  angle: v.optional(v.string()), // the messaging angle that lands for them
});

/**
 * Output of the research/strategist step: positioning, audience insights, an
 * art-direction brief (doubles as automatic inspiration) and any web sources.
 */
export const campaignResearch = v.object({
  positioning: v.optional(v.string()),
  insights: v.optional(v.array(v.string())),
  visualDirection: v.optional(
    v.object({
      palette: v.optional(v.string()),
      mood: v.optional(v.string()),
      layoutCues: v.optional(v.string()),
    }),
  ),
  sources: v.optional(v.array(v.string())),
  usedWeb: v.optional(v.boolean()),
  generatedAt: v.optional(v.number()),
});

/** A shot (generation) picked from a shoot to feature in the campaign. */
export const campaignShotRef = v.object({
  generationId: v.id("generations"),
  shootId: v.optional(v.id("shoots")),
});

/**
 * A media slot in a composed HTML/Tailwind ad. The AI layout declares slots by
 * id; the user binds a piece of media (a picked shot, a generated creative, or
 * a video) to each. `kind` controls whether it renders as <img> or <video>.
 */
export const adSlot = v.object({
  id: v.string(), // matches a {{slot:ID}} placeholder in the html
  label: v.optional(v.string()),
  kind: v.union(v.literal("image"), v.literal("video")),
  mediaUrl: v.optional(v.string()),
  posterUrl: v.optional(v.string()), // for video slots
  source: v.optional(v.string()), // "shot" | "creative" | "video"
  sourceId: v.optional(v.string()),
});

/**
 * Review state shared by rateable media (images, videos, campaign creatives).
 * Distinct from each table's generation `status` (queued/…/succeeded).
 */
export const reviewStatusV = v.union(
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("needs_changes"),
);

/**
 * The three review fields added to every rateable media table. `rating` is 1–5;
 * all optional (unset = unrated / unreviewed / not favorited). Spread into a
 * `defineTable({ ... })`.
 */
export const mediaReviewFields = {
  rating: v.optional(v.number()),
  reviewStatus: v.optional(reviewStatusV),
  favorite: v.optional(v.boolean()),
};

// ── Video / clips spec ──────────────────────────────────────────────────
// Storage-side mirror of the pure model in `@setto/core/video` (VideoSpec et
// al.). Keep these validators and that module in sync.

/** Ken Burns (pan/zoom) move applied to an image clip; ignored for video. */
export const videoEffect = v.object({
  type: v.union(v.literal("none"), v.literal("kenburns")),
  fromScale: v.optional(v.number()),
  toScale: v.optional(v.number()),
  fromX: v.optional(v.number()),
  fromY: v.optional(v.number()),
  toX: v.optional(v.number()),
  toY: v.optional(v.number()),
});

/** How a clip enters from the previous one (sequence templates only). */
export const videoTransition = v.object({
  type: v.union(
    v.literal("none"),
    v.literal("fade"),
    v.literal("dissolve"),
    v.literal("slide"),
    v.literal("wipe"),
  ),
  durationMs: v.number(),
});

/** A single clip on the timeline. `url` is a resolved, playable media URL. */
export const videoClip = v.object({
  id: v.string(),
  sourceType: v.union(v.literal("image"), v.literal("video")),
  url: v.string(),
  posterUrl: v.optional(v.string()),
  durationMs: v.number(),
  trimStartMs: v.optional(v.number()),
  effect: v.optional(videoEffect),
  transition: v.optional(videoTransition),
  layer: v.optional(v.number()),
  caption: v.optional(v.string()),
  // Provenance — informational snapshot links back to the source media. Plain
  // strings (not v.id) so this validator matches the pure `@setto/core/video`
  // VideoClip type exactly; cast to Id<...> at the few call sites that look them
  // up. Clips are denormalized (urls already resolved), so no FK is needed.
  generationId: v.optional(v.string()),
  videoId: v.optional(v.string()),
  shotId: v.optional(v.string()),
});

/** Background audio bed for the whole composition. */
export const videoAudio = v.object({
  url: v.string(),
  name: v.optional(v.string()),
  trackId: v.optional(v.string()),
  startMs: v.optional(v.number()),
  volume: v.optional(v.number()),
});

/** The self-contained composition the renderer consumes (frozen per render). */
export const videoSpec = v.object({
  templateId: v.string(),
  width: v.number(),
  height: v.number(),
  fps: v.number(),
  background: v.optional(v.string()),
  clips: v.array(videoClip),
  audio: v.optional(videoAudio),
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
    // Street View "nearby" expansion. When enabled, a capture also samples
    // random points within `streetViewRadiusMeters` of the pin and pulls frames
    // there too, so the backdrop reference pool includes nearby spots — the
    // generator (which picks a random location frame per image) then varies the
    // setting with real surroundings instead of always the exact same corner.
    streetViewRadiusEnabled: v.optional(v.boolean()),
    streetViewRadiusMeters: v.optional(v.number()),
    archived: v.optional(v.boolean()),
  }).index("by_org", ["orgId"]),

  // --- Library: outfit categories (editable taxonomy) ---------------------
  outfitCategories: defineTable({
    orgId: v.string(),
    createdBy: v.string(),
    name: v.string(),
    order: v.optional(v.number()),
  }).index("by_org", ["orgId"]),

  // --- Library: outfits (with embedded variations) ------------------------
  outfits: defineTable({
    orgId: v.string(),
    createdBy: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    // `categoryId` is the new editable taxonomy; `category` is the legacy
    // free-text value, kept for back-compat and used as a display fallback.
    categoryId: v.optional(v.id("outfitCategories")),
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
    // Shoot-wide default for Street View "nearby" expansion (see `locations`).
    // Used when a location in this shoot has no expansion setting of its own.
    streetViewRadiusEnabled: v.optional(v.boolean()),
    streetViewRadiusMeters: v.optional(v.number()),
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
    // Actor's clothing other than the main wardrobe piece (which comes from the
    // outfit image). Blank => the prompt picks clothing suited to person+place.
    clothingPrompt: v.optional(v.string()),
    extraPrompt: v.optional(v.string()),
    styleId: v.optional(v.id("presets")), // photography_style
    cameraId: v.optional(v.id("presets")), // camera_setup
    lightingId: v.optional(v.id("presets")), // lighting
    // Output aspect ratio (e.g. "4:5", "16:9"). Unset => provider default.
    aspectRatio: v.optional(v.string()),
    // Camera framing exported from the 3D staging step.
    cameraFraming: v.optional(v.any()),
  })
    .index("by_shoot_location", ["shootLocationId"])
    .index("by_shoot", ["shootId"])
    .index("by_org", ["orgId"]),

  // --- Campaigns ----------------------------------------------------------
  // A campaign turns shoot photos into finished ad creatives. It holds the ad
  // copy (typed or GPT-written), uploaded inspiration ad designs, the shots
  // picked from shoots, and the generated creatives (see campaignCreatives).
  campaigns: defineTable({
    orgId: v.string(),
    createdBy: v.string(),
    name: v.string(),
    // The concept brief: product, audience, tone, goal. Feeds copy + creative.
    brief: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("active"),
      v.literal("archived"),
    ),
    // Working ad copy shown on the creative.
    copy: v.optional(adCopy),
    // GPT-generated copy suggestions kept around so they survive a reload.
    copyVariants: v.optional(v.array(copyVariant)),
    // Research/strategist output + the audience personas it derived. Personas
    // drive the per-persona copy agents; research.visualDirection is the
    // automatic art-direction "inspiration".
    research: v.optional(campaignResearch),
    personas: v.optional(v.array(persona)),
    // Uploaded inspiration ad designs — used as style/layout references.
    inspirationRefs: v.optional(v.array(imageRef)),
    // Shots chosen from shoots to feature as the hero imagery.
    selectedShots: v.optional(v.array(campaignShotRef)),
    // Target aspect ratio for the creative ("1:1" | "4:5" | "9:16" | "16:9").
    aspectRatio: v.optional(v.string()),
    coverImage: v.optional(imageRef),
    // When false/unset, the image model generates CLEAN media (no baked text) —
    // copy + CTA are added as real text in the HTML ad composer. When true, the
    // legacy behavior of baking the copy into the pixels is used.
    bakeCopyIntoImage: v.optional(v.boolean()),
  })
    .index("by_org", ["orgId"])
    .index("by_org_status", ["orgId", "status"]),

  // A generated ad creative for a campaign. Mirrors `generations` but is scoped
  // to a campaign rather than a shot.
  campaignCreatives: defineTable({
    orgId: v.string(),
    createdBy: v.string(),
    campaignId: v.id("campaigns"),
    provider: v.string(),
    modelKey: v.string(),
    modelLabel: v.optional(v.string()),
    prompt: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("generating"),
      v.literal("succeeded"),
      v.literal("failed"),
    ),
    imageUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    seed: v.optional(v.number()),
    falRequestId: v.optional(v.string()),
    error: v.optional(v.string()),
    // Review: 1–5 rating, approve/reject/needs-changes, favorite.
    ...mediaReviewFields,
  })
    .index("by_campaign", ["campaignId"])
    .index("by_org", ["orgId"]),

  // A composed HTML/Tailwind ad: an AI-generated layout that overlays real,
  // editable copy + CTA on swappable media slots (images or videos). Unlike
  // campaignCreatives (a single baked image), this is markup rendered in an
  // iframe and rasterized to PNG on download.
  campaignAds: defineTable({
    orgId: v.string(),
    createdBy: v.string(),
    campaignId: v.id("campaigns"),
    status: v.union(
      v.literal("queued"),
      v.literal("generating"),
      v.literal("succeeded"),
      v.literal("failed"),
    ),
    aspectRatio: v.optional(v.string()),
    model: v.optional(v.string()), // text model id used to author the layout
    modelLabel: v.optional(v.string()),
    instructions: v.optional(v.string()), // extra art-direction from the user
    // The generated document: Tailwind-class HTML with {{slot:ID}} placeholders.
    html: v.optional(v.string()),
    // Media slots declared by the layout + their current bindings.
    slots: v.optional(v.array(adSlot)),
    // The copy the layout was authored against (so it's self-contained).
    copySnapshot: v.optional(adCopy),
    error: v.optional(v.string()),
  })
    .index("by_campaign", ["campaignId"])
    .index("by_org", ["orgId"]),

  // The growing, pinnable library of ad-copy variations for a campaign. Unlike
  // the legacy `campaigns.copyVariants` array (overwritten on each run), these
  // accumulate: every option the copywriter chat proposes is kept and can be
  // pinned, applied to the working copy, or removed.
  campaignCopyVariants: defineTable({
    orgId: v.string(),
    createdBy: v.string(),
    campaignId: v.id("campaigns"),
    headline: v.optional(v.string()),
    tagline: v.optional(v.string()),
    body: v.optional(v.string()),
    cta: v.optional(v.string()),
    // Which audience/angle this option was written for, plus any web sources the
    // research leaned on.
    personaName: v.optional(v.string()),
    angle: v.optional(v.string()),
    sources: v.optional(v.array(v.string())),
    // User-pinned favorites float to the top of the library.
    pinned: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_campaign", ["campaignId"])
    .index("by_campaign_pinned", ["campaignId", "pinned"]),

  // The persisted copywriter chat thread for a campaign — one row per campaign,
  // holding the AI SDK `UIMessage[]` verbatim so it round-trips through useChat.
  // The route loads it each turn, appends, streams, and saves it back.
  campaignCopyChats: defineTable({
    orgId: v.string(),
    campaignId: v.id("campaigns"),
    messages: v.array(v.any()),
    updatedAt: v.number(),
  }).index("by_campaign", ["campaignId"]),

  // --- Generations --------------------------------------------------------
  generations: defineTable({
    orgId: v.string(),
    createdBy: v.string(),
    shotId: v.id("shots"),
    shootId: v.id("shoots"),
    variationId: v.optional(v.string()), // which outfit variation (null => base)
    // Snapshot of the shot's recipe at generation time. A shot can later be
    // re-cast (different model/outfit/location/presets), so these frozen ids —
    // not the shot's *current* ones — are the source of truth for "what was in
    // this image" and power accurate per-model / per-location galleries.
    modelId: v.optional(v.id("models")),
    outfitId: v.optional(v.id("outfits")),
    locationId: v.optional(v.id("locations")),
    styleId: v.optional(v.id("presets")), // photography_style
    cameraId: v.optional(v.id("presets")), // camera_setup
    lightingId: v.optional(v.id("presets")), // lighting
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
    // Live progress while generating (driven by fal queue updates). `progress`
    // is 0..1; `progressLabel` is a short human stage like "In queue (3)".
    progress: v.optional(v.number()),
    progressLabel: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    seed: v.optional(v.number()),
    params: v.optional(v.any()),
    falRequestId: v.optional(v.string()),
    error: v.optional(v.string()),
    // Review: 1–5 rating, approve/reject/needs-changes, favorite.
    ...mediaReviewFields,
  })
    .index("by_shot", ["shotId"])
    .index("by_shoot", ["shootId"])
    .index("by_org", ["orgId"])
    .index("by_status", ["status"]),

  // --- Videos -------------------------------------------------------------
  // Image-to-video renders. Each row animates one source `generation` image via
  // a fal i2v model; a single image can have many videos (one per prompt/model
  // /duration). The fal-hosted URL is kept directly (like shot images).
  videos: defineTable({
    orgId: v.string(),
    createdBy: v.string(),
    generationId: v.id("generations"), // the source image
    shotId: v.id("shots"),
    shootId: v.id("shoots"),
    // Frozen recipe snapshot copied from the source generation, so per-model /
    // per-location galleries attribute videos correctly (mirrors generations).
    modelId: v.optional(v.id("models")),
    locationId: v.optional(v.id("locations")),
    provider: v.string(), // "fal"
    modelKey: v.string(), // video model id, e.g. "fal-ai/kling-video/..."
    modelLabel: v.optional(v.string()),
    prompt: v.string(),
    durationSeconds: v.number(), // chosen duration — drives cost
    status: v.union(
      v.literal("queued"),
      v.literal("generating"),
      v.literal("succeeded"),
      v.literal("failed"),
    ),
    progress: v.optional(v.number()), // 0..1
    progressLabel: v.optional(v.string()), // "In queue (3)", "Rendering…"
    videoUrl: v.optional(v.string()), // fal-hosted url (kept directly)
    posterUrl: v.optional(v.string()), // source image url, for thumbnail/poster
    storageId: v.optional(v.id("_storage")), // parity; unused by default
    seed: v.optional(v.number()),
    params: v.optional(v.any()),
    falRequestId: v.optional(v.string()),
    error: v.optional(v.string()),
    // Review: 1–5 rating, approve/reject/needs-changes, favorite.
    ...mediaReviewFields,
  })
    .index("by_generation", ["generationId"])
    .index("by_shot", ["shotId"])
    .index("by_shoot", ["shootId"])
    .index("by_org", ["orgId"])
    .index("by_status", ["status"]),

  // --- Video projects (the "clips" editor) --------------------------------
  // A composed, retimable video: an ordered list of clips (each backed by a
  // shot image or an i2v `videos` render), a template, audio bed, and output
  // resolution/fps. Distinct from the `videos` table (single i2v renders),
  // which supplies clip sources. The editable spec lives here; each export is a
  // `videoRenders` row. Field shape mirrors `@setto/core/video`'s VideoSpec.
  videoProjects: defineTable({
    orgId: v.string(),
    createdBy: v.string(),
    name: v.string(),
    // Optional origin shoot (entry points pass it so the project links back).
    shootId: v.optional(v.id("shoots")),
    // --- spec (flattened; see videoSpec) ---
    templateId: v.string(),
    width: v.number(),
    height: v.number(),
    fps: v.number(),
    background: v.optional(v.string()),
    clips: v.array(videoClip),
    audio: v.optional(videoAudio),
    // --- meta ---
    posterUrl: v.optional(v.string()), // first clip's still, for cards
    lastRenderId: v.optional(v.id("videoRenders")),
    ...mediaReviewFields,
  })
    .index("by_org", ["orgId"])
    .index("by_shoot", ["shootId"]),

  // --- Video renders (export jobs) ----------------------------------------
  // One row per export of a project to an mp4. Holds a frozen snapshot of the
  // spec it rendered (so re-renders are reproducible and the row is
  // self-contained), plus Remotion Lambda bookkeeping and the output URL.
  // Mirrors the queue/poll pattern used by `generations`/`videos`.
  videoRenders: defineTable({
    orgId: v.string(),
    createdBy: v.string(),
    projectId: v.id("videoProjects"),
    spec: videoSpec, // frozen snapshot of what was rendered
    width: v.number(),
    height: v.number(),
    fps: v.number(),
    durationMs: v.number(),
    status: v.union(
      v.literal("queued"),
      v.literal("rendering"),
      v.literal("succeeded"),
      v.literal("failed"),
    ),
    progress: v.optional(v.number()), // 0..1
    progressLabel: v.optional(v.string()),
    outputUrl: v.optional(v.string()), // mp4 (S3/Lambda or Convex storage)
    posterUrl: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")), // if mirrored into Convex storage
    // Remotion Lambda bookkeeping (so we can poll/cleanup).
    renderId: v.optional(v.string()),
    bucketName: v.optional(v.string()),
    renderRegion: v.optional(v.string()),
    costUsd: v.optional(v.number()),
    error: v.optional(v.string()),
    ...mediaReviewFields,
  })
    .index("by_project", ["projectId"])
    .index("by_org", ["orgId"])
    .index("by_status", ["status"]),

  // --- Usage & audit log --------------------------------------------------
  // One row per image-generation attempt, anywhere in the product. Powers team
  // usage tracking (counts + estimated spend) and the audit trail.
  usageEvents: defineTable({
    orgId: v.string(),
    userId: v.string(), // WorkOS user id of who triggered it
    userName: v.optional(v.string()),
    userEmail: v.optional(v.string()),
    kind: v.union(
      v.literal("shot"), // shot generation in a shoot
      v.literal("model_portrait"), // new model portrait (model editor)
      v.literal("model_sheet"), // standardized neutral model reference sheet
      v.literal("model_variation"), // legacy: random resemblance variation
      v.literal("campaign_copy"), // GPT ad-copy generation
      v.literal("campaign_creative"), // ad-creative image generation
      v.literal("video"), // image-to-video render
      v.literal("video_export"), // video-project mp4 render (Remotion)
    ),
    provider: v.string(),
    modelKey: v.string(),
    modelLabel: v.optional(v.string()),
    status: v.union(v.literal("succeeded"), v.literal("failed")),
    cost: v.number(), // estimated USD (0 on failure)
    durationSeconds: v.optional(v.number()), // for video events (cost basis)
    // Context links (best-effort; depend on the source).
    generationId: v.optional(v.id("generations")),
    videoId: v.optional(v.id("videos")),
    videoProjectId: v.optional(v.id("videoProjects")),
    videoRenderId: v.optional(v.id("videoRenders")),
    shotId: v.optional(v.id("shots")),
    shootId: v.optional(v.id("shoots")),
    modelId: v.optional(v.id("models")),
    campaignId: v.optional(v.id("campaigns")),
    campaignCreativeId: v.optional(v.id("campaignCreatives")),
    error: v.optional(v.string()),
  })
    .index("by_org", ["orgId"])
    .index("by_org_user", ["orgId", "userId"]),
});
