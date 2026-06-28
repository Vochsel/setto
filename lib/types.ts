import type { Id } from "@/convex/_generated/dataModel";

/** Shared client-side types mirroring the Convex `imageRef` validator. */
export interface ImageRef {
  storageId?: Id<"_storage">;
  url?: string;
  caption?: string;
  source?: string;
}

export interface OutfitVariation {
  id: string;
  name: string;
  promptDescriptor?: string;
  images?: ImageRef[];
}

/**
 * Normalize refs before sending to Convex. Storage-backed images drop their
 * (signed, expiring) url — it's re-resolved from the storageId on read.
 */
export function cleanImageRefs(refs: ImageRef[]): ImageRef[] {
  return refs.map((r) =>
    r.storageId
      ? { storageId: r.storageId, caption: r.caption, source: r.source }
      : { url: r.url, caption: r.caption, source: r.source },
  );
}

/** Merge raw refs with resolved display URLs (for editing existing entities). */
export function withDisplayUrls(
  refs: ImageRef[] | undefined,
  resolved: { url: string }[] | undefined,
): ImageRef[] {
  if (!refs?.length) return [];
  return refs.map((r, i) => ({ ...r, url: r.url ?? resolved?.[i]?.url }));
}
