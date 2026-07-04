import {
  action,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal, api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";

/** Default "nearby" expansion radius (metres) when enabled without a value. */
export const DEFAULT_STREETVIEW_RADIUS_M = 150;
/** How many random nearby points to sample when expansion is on. */
const NEARBY_POINTS = 3;
/** Frame dimensions we request from the Street View Static API. */
const TILE_SIZE = "640x640";

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
      throw new Error("This location has no map coordinates yet.");
    }
    const key =
      process.env.GOOGLE_MAPS_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
    if (!key) {
      throw new Error(
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
        `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&key=${key}`,
      );
      const meta = (await res.json()) as { status?: string };
      const ok = meta.status === "OK";
      if (ok) {
        await ctx.runMutation(internal.streetview.putCachedMeta, { key: k });
      }
      return ok;
    };

    if (!(await hasImagery(loc.lat, loc.lng))) {
      throw new Error("No Street View imagery available here.");
    }

    const refs: {
      storageId: Id<"_storage">;
      source: string;
      caption: string;
    }[] = [];

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
        `&location=${lat},${lng}&heading=${heading}&pitch=${pitch}&fov=${fov}&key=${key}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const blob = await res.blob();
      const storageId = await ctx.storage.store(blob);
      await ctx.runMutation(internal.streetview.putCachedTile, {
        key: k,
        storageId,
      });
      refs.push({ storageId, source: "street_view", caption });
    };

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
