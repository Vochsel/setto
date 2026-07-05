"use node";
/**
 * Cloudflare R2 storage backend (S3-compatible). When configured, generated
 * media is written here instead of Convex file storage, and served from the
 * public bucket URL (a CDN-backed r2.dev or custom domain).
 *
 * Config comes from env (set in the Convex dashboard):
 *   R2_ACCOUNT_ID           - Cloudflare account id (endpoint host)
 *   R2_BUCKET               - bucket name
 *   R2_S3_ACCESS_KEY_ID     - S3 access key id
 *   R2_S3_SECRET_ACCESS_KEY - S3 secret
 *   R2_PUBLIC_URL           - public base for reads, e.g. https://media.setto.app
 *
 * If any are missing, `r2Enabled()` is false and callers fall back to Convex
 * storage — so the app keeps working before/while R2 is wired up.
 */
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

const ACCOUNT_ID = env("R2_ACCOUNT_ID");
const BUCKET = env("R2_BUCKET");
const ACCESS_KEY_ID = env("R2_S3_ACCESS_KEY_ID");
const SECRET_ACCESS_KEY = env("R2_S3_SECRET_ACCESS_KEY");
const PUBLIC_URL = env("R2_PUBLIC_URL")?.replace(/\/+$/, "");

/** True once R2 is fully configured (credentials + a public read URL). */
export function r2Enabled(): boolean {
  return Boolean(
    ACCOUNT_ID && BUCKET && ACCESS_KEY_ID && SECRET_ACCESS_KEY && PUBLIC_URL,
  );
}

let client: S3Client | null = null;
function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: ACCESS_KEY_ID!,
        secretAccessKey: SECRET_ACCESS_KEY!,
      },
    });
  }
  return client;
}

/** The public URL for an object key. */
export function r2PublicUrl(key: string): string {
  return `${PUBLIC_URL}/${key}`;
}

/** Whether a URL already points at our R2 public bucket (migration idempotency). */
export function isR2Url(url: string | undefined): boolean {
  return Boolean(PUBLIC_URL && url && url.startsWith(PUBLIC_URL + "/"));
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

/** A fresh object key under a folder, with an extension guessed from the type. */
export function r2Key(folder: string, contentType: string): string {
  const ext = EXT[contentType.split(";")[0]] ?? "bin";
  return `${folder}/${randomUUID()}.${ext}`;
}

/** Upload bytes to R2 and return the public URL + key. */
export async function putToR2(
  bytes: Buffer,
  contentType: string,
  folder: string,
): Promise<{ url: string; key: string }> {
  const key = r2Key(folder, contentType);
  await s3().send(
    new PutObjectCommand({
      Bucket: BUCKET!,
      Key: key,
      Body: bytes,
      ContentType: contentType,
      // Long-lived: keys are content-immutable (fresh UUID per upload).
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return { url: r2PublicUrl(key), key };
}
