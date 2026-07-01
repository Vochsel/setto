/**
 * The per-workspace audio library. Tracks uploaded in the video editor are
 * persisted here so any project can pick from previously-uploaded songs (rather
 * than re-uploading the same file per project).
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getScope, assertOrg } from "./lib/auth";

/** All uploaded tracks for the workspace, newest first, with resolved URLs. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const scope = await getScope(ctx);
    const rows = await ctx.db
      .query("audioTracks")
      .withIndex("by_org", (q) => q.eq("orgId", scope.orgId))
      .order("desc")
      .collect();
    return Promise.all(
      rows.map(async (r) => ({
        _id: r._id,
        _creationTime: r._creationTime,
        name: r.name,
        durationMs: r.durationMs,
        url:
          r.url ??
          (r.storageId
            ? ((await ctx.storage.getUrl(r.storageId)) ?? undefined)
            : undefined),
      })),
    );
  },
});

/** Persist a freshly-uploaded track to the library and return its playable row. */
export const create = mutation({
  args: {
    storageId: v.id("_storage"),
    name: v.string(),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, { storageId, name, durationMs }) => {
    const scope = await getScope(ctx);
    const clean = name.trim() || "Audio track";
    const url = (await ctx.storage.getUrl(storageId)) ?? undefined;
    const id = await ctx.db.insert("audioTracks", {
      orgId: scope.orgId,
      createdBy: scope.userId,
      name: clean,
      storageId,
      url,
      durationMs,
    });
    return { _id: id, name: clean, url, durationMs };
  },
});

/** Remove a track from the library (does not touch projects already using it). */
export const remove = mutation({
  args: { id: v.id("audioTracks") },
  handler: async (ctx, { id }) => {
    const scope = await getScope(ctx);
    assertOrg(await ctx.db.get(id), scope);
    await ctx.db.delete(id);
  },
});
