import {
  action,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";
import { internal, api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { v, ConvexError } from "convex/values";

/** Default "nearby" expansion radius (metres) when enabled without a value. */
export const DEFAULT_STREETVIEW_RADIUS_M = 150;
/** How many random nearby points to sample when expansion is on. */
const NEARBY_POINTS = 3;
/** Frame dimensions we request from the Street View Static API. */
const TILE_SIZE = "640x640";
/**
 * How far Google may look for the nearest panorama when a pin isn't sitting
 * exactly on Street View coverage. The Static/metadata APIs default to 50m,
 * which fails a lot of real pins (rooftops, courtyards, set-back buildings);
 * widening to a few hundred metres snaps to the nearest street with imagery so
 * capture "just works" for most locations. Both the metadata probe and the
 * image fetch use the same value so an OK probe always yields a frame.
 */
const SNAP_RADIUS_M = 400;

/** How many Google Places photos to pull for a pinned place (see below). */
const MAX_PLACE_PHOTOS = 4;

/**
 * Smallest believable Street View frame, in bytes.
 *
 * When a request lands where there's no panorama, the Static API doesn't fail —
 * it answers 200 with the flat grey "Sorry, we have no imagery here" card. At
 * our 640x640 that card is byte-identical wherever it comes from (~8.8KB, and
 * near-uniform), while a real frame runs 60-200KB of street detail. Storing one
 * poisons the reference pool: the model is handed a blank card as "the
 * location", and OpenAI's editor can reject it outright.
 *
 * The metadata probe catches most of these, but it answers per *point* while
 * frames are fetched per heading, so a placeholder can still slip through. 12KB
 * sits far above the card and far below any real frame.
 */
const MIN_TILE_BYTES = 12_000;

/** Bytes that are an actual image, not an error card or an error page. */
function looksLikeImage(contentType: string | null, size: number): boolean {
  return (contentType ?? "").startsWith("image/") && size >= MIN_TILE_BYTES;
}

/**
 * Best-effort: fetch a few Google Places photos for a pinned place and store
 * them in Convex. For businesses (cafés, shops, restaurants) these are often
 * *interior* shots — exactly what Street View's outdoor panoramas miss — so
 * they give interior locations real grounding. Needs the Places API enabled on
 * the key; any failure (API disabled, no photos) yields an empty list, never an
 * error. Uses the legacy Places Photo endpoint, which 302-redirects to bytes.
 */
async function fetchPlacePhotos(
  ctx: ActionCtx,
  placeId: string,
  key: string,
  max: number,
): Promise<{ storageId: Id<"_storage">; source: string; caption: string }[]> {
  const out: { storageId: Id<"_storage">; source: string; caption: string }[] =
    [];
  try {
    const detailsRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
        placeId,
      )}&fields=photos&key=${key}`,
    );
    const details = (await detailsRes.json()) as {
      result?: { photos?: { photo_reference?: string }[] };
    };
    const photos = details.result?.photos ?? [];
    for (const p of photos.slice(0, max)) {
      if (!p.photo_reference) continue;
      const photoRes = await fetch(
        `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1600&photo_reference=${p.photo_reference}&key=${key}`,
      );
      if (!photoRes.ok) continue;
      const blob = await photoRes.blob();
      // The photo endpoint 302s to a CDN; a stale or revoked reference can land
      // on an error page instead of bytes. Only keep real images.
      if (!looksLikeImage(blob.type, blob.size)) continue;
      const storageId = await ctx.storage.store(blob);
      out.push({ storageId, source: "places", caption: "Place photo" });
    }
  } catch {
    // Places API may be disabled on the key — grounding is a nice-to-have.
  }
  return out;
}

/**
 * Quantize a coordinate for use in a cache key. Six decimals is ~0.11m — far
 * finer than Street View's panorama spacing — so it collapses float noise
 * without ever merging two genuinely different spots.
 */
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Cache key for one captured frame (a Street View Static API tile). */
const tileKey = (
  lat: number,
  lng: number,
  heading: number,
  pitch: number,
  fov: number,
  size: string,
) => `${round6(lat)}|${round6(lng)}|${heading}|${pitch}|${fov}|${size}`;

/** Cache key for an imagery-availability metadata probe at a point. */
const metaKey = (lat: number, lng: number) =>
  `${round6(lat)}|${round6(lng)}`;

/**
 * A lat/lng `distM` metres from (lat,lng) along compass bearing `bearingDeg`.
 * Standard spherical "destination point" formula — good enough for the few-
 * hundred-metre offsets we sample around a pin.
 */
function offset(
  lat: number,
  lng: number,
  distM: number,
  bearingDeg: number,
): { lat: number; lng: number } {
  const R = 6371000; // mean earth radius, metres
  const br = (bearingDeg * Math.PI) / 180;
  const latR = (lat * Math.PI) / 180;
  const lngR = (lng * Math.PI) / 180;
  const dr = distM / R;
  const lat2 = Math.asin(
    Math.sin(latR) * Math.cos(dr) +
      Math.cos(latR) * Math.sin(dr) * Math.cos(br),
  );
  const lng2 =
    lngR +
    Math.atan2(
      Math.sin(br) * Math.sin(dr) * Math.cos(latR),
      Math.cos(dr) - Math.sin(latR) * Math.sin(lat2),
    );
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}

/**
 * Capture real-world reference imagery for a location from the Google Street
 * View Static API at several headings, store the frames in Convex, and append
 * them to the location's `streetViewRefs` (used to ground the backdrop).
 *
 * When `radiusMeters` > 0 (or the location's own expansion setting is on), the
 * capture also samples a few random points within that radius of the pin and
 * pulls frames there too, so the reference pool spans the surrounding area.
 * Pass `radiusMeters` explicitly to override the stored setting (e.g. a shoot-
 * wide radius); omit it to use the location's own configuration.
 *
 * Requires GOOGLE_MAPS_API_KEY in the Convex deployment env:
 *   npx convex env set GOOGLE_MAPS_API_KEY <key>
 */
export const capture = action({
  args: {
    locationId: v.id("locations"),
    headings: v.optional(v.array(v.number())),
    fov: v.optional(v.number()),
    pitch: v.optional(v.number()),
    radiusMeters: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const loc = await ctx.runQuery(api.locations.get, { id: args.locationId });
    if (loc.lat == null || loc.lng == null) {
      throw new ConvexError("This location has no map coordinates yet.");
    }
    const key =
      process.env.GOOGLE_MAPS_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
    if (!key) {
      throw new ConvexError(
        "GOOGLE_MAPS_API_KEY is not set in the Convex deployment. Run: npx convex env set GOOGLE_MAPS_API_KEY <key>",
      );
    }

    const fov = args.fov ?? 90;
    const pitch = args.pitch ?? 0;
    const headings = args.headings ?? [0, 90, 180, 270];

    // How many frames we served from the Convex cache instead of the Google
    // API, so callers can see the cache doing its job.
    let fromCache = 0;

    // Resolve the effective expansion radius: an explicit arg wins (lets a
    // shoot pass its own radius), otherwise fall back to the location's own
    // stored setting. Zero / unset => centre-only, the classic behaviour.
    const radius =
      args.radiusMeters ??
      (loc.streetViewRadiusEnabled
        ? (loc.streetViewRadiusMeters ?? DEFAULT_STREETVIEW_RADIUS_M)
        : 0);

    /**
     * Confirm Street View exists at a point. A positive result is cached per
     * rounded coordinate so repeat captures skip the metadata round-trip. We
     * deliberately do NOT cache a negative: imagery is only ever added to a
     * spot over time, so a "no imagery" answer must stay re-probeable.
     */
    const hasImagery = async (lat: number, lng: number): Promise<boolean> => {
      const k = metaKey(lat, lng);
      if (await ctx.runQuery(internal.streetview.getCachedMeta, { key: k })) {
        return true;
      }
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&radius=${SNAP_RADIUS_M}&key=${key}`,
      );
      const meta = (await res.json()) as { status?: string };
      const ok = meta.status === "OK";
      if (ok) {
        await ctx.runMutation(internal.streetview.putCachedMeta, { key: k });
      }
      return ok;
    };

    const refs: {
      storageId: Id<"_storage">;
      source: string;
      caption: string;
    }[] = [];

    // Best-effort real place photos (often interiors) for a pinned business.
    // Fetched up front so an interior-only place with no Street View coverage
    // still gets grounded instead of failing outright. Skipped once the location
    // already has them, so a repeated "Recapture" doesn't pile up duplicates.
    const alreadyHasPlacePhotos = (loc.streetViewRefs ?? []).some(
      (r) => r.source === "places",
    );
    const placePhotos =
      loc.googlePlaceId && !alreadyHasPlacePhotos
        ? await fetchPlacePhotos(ctx, loc.googlePlaceId, key, MAX_PLACE_PHOTOS)
        : [];

    const hasCenter = await hasImagery(loc.lat, loc.lng);
    if (!hasCenter && placePhotos.length === 0) {
      throw new ConvexError(
        `No Street View or place imagery within ${SNAP_RADIUS_M}m of this pin. Try moving it closer to a street.`,
      );
    }

    /** Grab one frame at a point/heading and queue it as a stored ref. */
    const grab = async (
      lat: number,
      lng: number,
      heading: number,
      caption: string,
    ) => {
      // A previously captured frame for these exact params is reused straight
      // from Convex storage — no Google call, no extra stored copy.
      const k = tileKey(lat, lng, heading, pitch, fov, TILE_SIZE);
      const cached = await ctx.runQuery(internal.streetview.getCachedTile, {
        key: k,
      });
      if (cached) {
        refs.push({ storageId: cached, source: "street_view", caption });
        fromCache++;
        return;
      }
      const url =
        `https://maps.googleapis.com/maps/api/streetview?size=${TILE_SIZE}` +
        `&location=${lat},${lng}&radius=${SNAP_RADIUS_M}` +
        `&heading=${heading}&pitch=${pitch}&fov=${fov}&key=${key}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const blob = await res.blob();
      // Don't store (or cache) the "no imagery here" card — see MIN_TILE_BYTES.
      if (!looksLikeImage(blob.type, blob.size)) return;
      const storageId = await ctx.storage.store(blob);
      await ctx.runMutation(internal.streetview.putCachedTile, {
        key: k,
        storageId,
      });
      refs.push({ storageId, source: "street_view", caption });
    };

    // Street View frames only when the pin actually has panorama coverage. A
    // pin with none (a set-back interior) still returns via the place photos.
    if (hasCenter) {
      // Centre point — the full heading set, as before.
      for (const heading of headings) {
        await grab(loc.lat, loc.lng, heading, `Street View · ${heading}°`);
      }

      // Nearby points — a couple of frames each, at random offsets within the
      // radius, so the pool picks up real surroundings a short walk away.
      if (radius > 0) {
        for (let i = 0; i < NEARBY_POINTS; i++) {
          const dist = radius * (0.35 + Math.random() * 0.65);
          const bearing = Math.random() * 360;
          const p = offset(loc.lat, loc.lng, dist, bearing);
          if (!(await hasImagery(p.lat, p.lng))) continue;
          const h1 = Math.round(Math.random() * 360);
          const h2 = (h1 + 90 + Math.round(Math.random() * 180)) % 360;
          const m = Math.round(dist);
          await grab(p.lat, p.lng, h1, `Nearby · ~${m}m · ${h1}°`);
          await grab(p.lat, p.lng, h2, `Nearby · ~${m}m · ${h2}°`);
        }
      }
    }

    // Add the place photos (interiors) alongside any Street View frames.
    refs.push(...placePhotos);

    if (refs.length) {
      await ctx.runMutation(internal.streetview.appendRefs, {
        locationId: args.locationId,
        refs,
      });
    }
    return { added: refs.length, fromCache };
  },
});

/**
 * Look up a cached Street View frame by its request key. Returns the stored
 * file id, or null on a cache miss. `.first()` (not `.unique()`) so a rare
 * duplicate from a write race can never throw a lookup.
 */
export const getCachedTile = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ctx.db
      .query("streetViewCache")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    return row?.storageId ?? null;
  },
});

/** Record a freshly fetched frame under its request key (first writer wins). */
export const putCachedTile = internalMutation({
  args: { key: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, { key, storageId }) => {
    const existing = await ctx.db
      .query("streetViewCache")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    if (existing) return;
    await ctx.db.insert("streetViewCache", {
      key,
      storageId,
      createdAt: Date.now(),
    });
  },
});

/**
 * True when we've already confirmed Street View imagery exists at this point.
 * A row is only ever written for a positive probe, so its presence is the
 * answer.
 */
export const getCachedMeta = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ctx.db
      .query("streetViewMetaCache")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    return row !== null;
  },
});

/** Record that Street View imagery exists at a point (first writer wins). */
export const putCachedMeta = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const existing = await ctx.db
      .query("streetViewMetaCache")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    if (existing) return;
    await ctx.db.insert("streetViewMetaCache", { key, createdAt: Date.now() });
  },
});

export const appendRefs = internalMutation({
  args: {
    locationId: v.id("locations"),
    refs: v.array(
      v.object({
        storageId: v.id("_storage"),
        source: v.string(),
        caption: v.string(),
      }),
    ),
  },
  handler: async (ctx, { locationId, refs }) => {
    const loc = await ctx.db.get(locationId);
    if (!loc) return;
    await ctx.db.patch(locationId, {
      streetViewRefs: [...(loc.streetViewRefs ?? []), ...refs],
    });
  },
});

/**
 * One-off cleanup: drop already-stored "no imagery here" cards from locations.
 *
 * Captures now refuse to store them (see MIN_TILE_BYTES), but anything captured
 * before that keeps being handed to the generator as a reference photo. Sizes
 * come from the `_storage` system table, so this is a cheap metadata pass — no
 * bytes are read. Cached tiles pointing at the same files go too, otherwise the
 * next capture serves the card straight back from cache.
 *
 * Run with: npx convex run streetview:pruneBlankRefs '{}' [--prod]
 */
export const pruneBlankRefs = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, { dryRun }) => {
    const blank = async (storageId: Id<"_storage">) => {
      const meta = await ctx.db.system.get(storageId);
      return !meta || meta.size < MIN_TILE_BYTES;
    };

    let removedRefs = 0;
    const dropped: Id<"_storage">[] = [];
    for (const loc of await ctx.db.query("locations").collect()) {
      const refs = loc.streetViewRefs ?? [];
      if (!refs.length) continue;
      const keep = [];
      for (const r of refs) {
        if (r.storageId && (await blank(r.storageId))) {
          dropped.push(r.storageId);
          removedRefs++;
        } else {
          keep.push(r);
        }
      }
      if (keep.length !== refs.length && !dryRun) {
        await ctx.db.patch(loc._id, { streetViewRefs: keep });
      }
    }

    let removedCacheRows = 0;
    if (dropped.length) {
      const ids = new Set(dropped);
      for (const row of await ctx.db.query("streetViewCache").collect()) {
        if (!ids.has(row.storageId)) continue;
        removedCacheRows++;
        if (!dryRun) await ctx.db.delete(row._id);
      }
    }

    return { removedRefs, removedCacheRows, dryRun: !!dryRun };
  },
});
