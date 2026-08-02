/**
 * Same-origin media proxy: re-serves our media hosts with
 * `Access-Control-Allow-Origin: *` so the browser can *read* the bytes.
 *
 * Two callers need that. The ad composer rasterizes a sandboxed
 * (opaque-origin) iframe with html-to-image, where cross-origin images taint
 * the canvas and break the PNG export. And the lightbox crops / copies /
 * downloads images — R2's public bucket (`pub-*.r2.dev`) sends no CORS header
 * whatsoever, so reading those bytes directly fails outright.
 *
 * The host allowlist keeps this from becoming an open SSRF/proxy. It mirrors
 * the `images.remotePatterns` list in next.config.ts.
 */

// Hostname suffixes we're willing to fetch on the client's behalf.
const ALLOWED_SUFFIXES = [
  ".r2.dev",
  ".convex.cloud",
  ".convex.site",
  ".fal.media",
  ".fal.run",
  ".fal.ai",
];

/** A custom R2 domain (R2_PUBLIC_URL), if this deployment serves media from one. */
function customMediaHost(): string | null {
  const raw = process.env.R2_PUBLIC_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isAllowed(u: URL): boolean {
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (host === customMediaHost()) return true;
  return ALLOWED_SUFFIXES.some(
    (suffix) => host === suffix.slice(1) || host.endsWith(suffix),
  );
}

export async function GET(request: Request): Promise<Response> {
  const target = new URL(request.url).searchParams.get("url");
  if (!target) return new Response("Missing url", { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }
  if (!isAllowed(parsed)) {
    return new Response("Host not allowed", { status: 403 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(parsed.toString());
  } catch {
    return new Response("Upstream fetch failed", { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response("Upstream error", { status: 502 });
  }

  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("access-control-allow-origin", "*");
  headers.set("cache-control", "public, max-age=3600, immutable");

  return new Response(upstream.body, { status: 200, headers });
}
