import { action, internalMutation } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";

/**
 * Capture real-world reference imagery for a location from the Google Street
 * View Static API at several headings, store the frames in Convex, and append
 * them to the location's `streetViewRefs` (used to ground the backdrop).
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

    const loc2 = `${loc.lat},${loc.lng}`;
    // Confirm imagery exists at this point.
    const metaRes = await fetch(
      `https://maps.googleapis.com/maps/api/streetview/metadata?location=${loc2}&key=${key}`,
    );
    const meta = (await metaRes.json()) as { status?: string };
    if (meta.status !== "OK") {
      throw new Error(
        `No Street View imagery available here (status: ${meta.status ?? "unknown"}).`,
      );
    }

    const headings = args.headings ?? [0, 90, 180, 270];
    const fov = args.fov ?? 90;
    const pitch = args.pitch ?? 0;

    const refs: {
      storageId: Id<"_storage">;
      source: string;
      caption: string;
    }[] = [];
    for (const heading of headings) {
      const url =
        `https://maps.googleapis.com/maps/api/streetview?size=640x640` +
        `&location=${loc2}&heading=${heading}&pitch=${pitch}&fov=${fov}&key=${key}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const blob = await res.blob();
      const storageId = await ctx.storage.store(blob);
      refs.push({
        storageId,
        source: "street_view",
        caption: `Street View · ${heading}°`,
      });
    }

    if (refs.length) {
      await ctx.runMutation(internal.streetview.appendRefs, {
        locationId: args.locationId,
        refs,
      });
    }
    return { added: refs.length };
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
