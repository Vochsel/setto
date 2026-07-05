"use node";
/**
 * Media storage + thumbnailing for generated images and videos.
 *
 * Two goals:
 *   1. Own our bytes — download provider (fal) outputs into Convex storage so the
 *      library doesn't depend on third-party CDN URLs persisting.
 *   2. Load fast — precompute a small WebP thumbnail for grids so clients pull
 *      ~20KB instead of a multi-MB original. Full-res is still served for the
 *      lightbox / reel.
 *
 * `storeFromUrl` is the single seam to swap when we move storage to R2/Cloudflare:
 * change where bytes are written + how a public URL is formed, nothing else.
 */
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import sharp from "sharp";
import { r2Enabled, putToR2 } from "./r2";

/** Longest-edge size (px) for grid thumbnails. */
const THUMB_MAX = 600;

/** R2 key folders per media kind. */
const FOLDER = { image: "img", thumb: "thumb", video: "vid" } as const;

export interface StoredMedia {
  /** Convex storage id — undefined when the bytes live in R2 instead. */
  storageId?: Id<"_storage">;
  url: string;
}
export interface StoredImage extends StoredMedia {
  thumbStorageId?: Id<"_storage">;
  thumbnailUrl?: string;
}

/** Fetch raw bytes from a URL (provider CDN or elsewhere). */
export async function fetchBytes(url: string): Promise<{
  bytes: Buffer;
  contentType: string;
}> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status} for ${url.slice(0, 80)}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  return { bytes, contentType };
}

/**
 * Store a blob and resolve its public URL. Writes to R2 when configured, else
 * Convex file storage. This is the single storage seam — the only place that
 * decides where bytes live. `kind` picks the R2 key folder.
 */
export async function storeBlob(
  ctx: ActionCtx,
  bytes: Buffer,
  contentType: string,
  kind: keyof typeof FOLDER = "image",
): Promise<StoredMedia> {
  if (r2Enabled()) {
    const { url } = await putToR2(bytes, contentType, FOLDER[kind]);
    return { url };
  }
  // Copy into a fresh ArrayBuffer-backed view so it's a valid BlobPart.
  const blob = new Blob([Uint8Array.from(bytes)], { type: contentType });
  const storageId = await ctx.storage.store(blob);
  const url = (await ctx.storage.getUrl(storageId)) ?? "";
  return { storageId, url };
}

/** Download a URL's bytes and store them (R2 or Convex). */
export async function storeFromUrl(
  ctx: ActionCtx,
  url: string,
  kind: keyof typeof FOLDER = "video",
): Promise<StoredMedia & { bytes: Buffer; contentType: string }> {
  const { bytes, contentType } = await fetchBytes(url);
  const stored = await storeBlob(ctx, bytes, contentType, kind);
  return { ...stored, bytes, contentType };
}

/** A crop rectangle as fractions of the (displayed, EXIF-oriented) image. */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Crop image bytes to a normalized rectangle and re-encode, preserving PNG/WebP
 * (else JPEG). The rect is in the coordinate space of the *displayed* image, so
 * EXIF orientation is baked in first when present — otherwise a rotated phone
 * photo would crop the wrong region. Done server-side so crop works on R2 images
 * without any browser cross-origin canvas read. Throws on undecodable input.
 */
export async function cropImageBytes(
  bytes: Buffer,
  contentType: string,
  rect: CropRect,
): Promise<{ bytes: Buffer; contentType: string }> {
  const meta = await sharp(bytes).metadata();
  // EXIF orientations 5–8 are 90°/270° rotations, which swap width/height as
  // displayed. Only re-encode to an upright buffer when rotation is actually
  // needed — the common case (AI-generated images, orientation 1) stays a
  // single decode/encode.
  let img: Buffer = bytes;
  let W = meta.width ?? 0;
  let H = meta.height ?? 0;
  if ((meta.orientation ?? 1) !== 1) {
    const upright = await sharp(bytes)
      .rotate()
      .toBuffer({ resolveWithObject: true });
    img = upright.data;
    W = upright.info.width;
    H = upright.info.height;
  }
  if (!W || !H) throw new Error("Unreadable image dimensions");

  const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
  const left = Math.min(W - 1, Math.round(clamp01(rect.x) * W));
  const top = Math.min(H - 1, Math.round(clamp01(rect.y) * H));
  const width = Math.max(1, Math.min(W - left, Math.round(clamp01(rect.w) * W)));
  const height = Math.max(1, Math.min(H - top, Math.round(clamp01(rect.h) * H)));

  const pipeline = sharp(img).extract({ left, top, width, height });
  const type = contentType.split(";")[0].trim();
  if (type === "image/png") {
    return { bytes: await pipeline.png().toBuffer(), contentType: "image/png" };
  }
  if (type === "image/webp") {
    return {
      bytes: await pipeline.webp({ quality: 95 }).toBuffer(),
      contentType: "image/webp",
    };
  }
  return {
    bytes: await pipeline.jpeg({ quality: 95 }).toBuffer(),
    contentType: "image/jpeg",
  };
}

/** Resize image bytes to a small WebP thumbnail. Throws on undecodable input. */
export async function makeThumbnail(bytes: Buffer): Promise<Buffer> {
  return await sharp(bytes)
    .rotate() // honor EXIF orientation before stripping metadata
    .resize(THUMB_MAX, THUMB_MAX, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 72 })
    .toBuffer();
}

/**
 * Store image bytes as the original plus a WebP thumbnail. Thumbnailing is
 * best-effort: if sharp can't decode the input, we still return the stored
 * original (callers fall back to using the full image as its own thumbnail).
 */
export async function storeImageWithThumbnail(
  ctx: ActionCtx,
  bytes: Buffer,
  contentType: string,
): Promise<StoredImage> {
  const original = await storeBlob(ctx, bytes, contentType, "image");
  try {
    const thumb = await makeThumbnail(bytes);
    const storedThumb = await storeBlob(ctx, thumb, "image/webp", "thumb");
    return {
      ...original,
      thumbStorageId: storedThumb.storageId,
      thumbnailUrl: storedThumb.url,
    };
  } catch {
    return original; // thumbnail is a nice-to-have, never fatal
  }
}

/** Download an image URL and store original + thumbnail. */
export async function storeImageFromUrl(
  ctx: ActionCtx,
  url: string,
): Promise<StoredImage> {
  const { bytes, contentType } = await fetchBytes(url);
  return await storeImageWithThumbnail(ctx, bytes, contentType);
}

/** A standalone thumbnail from an image URL (for video posters, backfills). */
export async function thumbnailFromUrl(
  ctx: ActionCtx,
  url: string,
): Promise<StoredMedia | null> {
  try {
    const { bytes } = await fetchBytes(url);
    const thumb = await makeThumbnail(bytes);
    return await storeBlob(ctx, thumb, "image/webp", "thumb");
  } catch {
    return null;
  }
}
