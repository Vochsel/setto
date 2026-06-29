/**
 * Same-origin media proxy for the ad composer's PNG export.
 *
 * The composed ad is rendered in an opaque-origin sandboxed iframe and
 * rasterized with html-to-image. Cross-origin images (Convex storage, fal)
 * taint the canvas and break the export, so we proxy them through here and
 * return `Access-Control-Allow-Origin: *` — making the bytes CORS-clean for the
 * rasterizer (the iframe requests them with `crossorigin="anonymous"`).
 *
 * The host allowlist keeps this from becoming an open SSRF/proxy.
 */

// Hostname suffixes we're willing to fetch on the client's behalf.
const ALLOWED_SUFFIXES = [
  ".convex.cloud",
  ".convex.site",
  ".fal.media",
  ".fal.run",
  ".fal.ai",
];

function isAllowed(u: URL): boolean {
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
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
