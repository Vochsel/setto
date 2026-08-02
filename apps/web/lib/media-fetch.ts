/**
 * Reading media *bytes* in the browser (canvas crop, clipboard copy, download)
 * needs a CORS grant that our stores don't all give: R2's public bucket
 * (`pub-*.r2.dev`) sends no `Access-Control-Allow-Origin` at all, so a direct
 * `fetch()` throws "Failed to fetch" and a canvas drawn from it would be
 * tainted. `/api/media-proxy` re-serves those bytes from our own origin.
 *
 * Displaying media (an `<img src>`) never needed this — only reading it does.
 */

/** Same-origin URL that streams a remote asset back CORS-clean. */
export const mediaProxyUrl = (url: string) =>
  `/api/media-proxy?url=${encodeURIComponent(url)}`;

/** Bytes the browser can already read: our own origin, blobs, data URLs. */
function sameOrigin(url: string): boolean {
  if (/^(blob:|data:)/i.test(url)) return true;
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

// Origins that have already refused a direct read. Retrying them just fills the
// console with CORS errors, so after the first failure we go straight to the
// proxy for the rest of the session.
const needsProxy = new Set<string>();

function originOf(url: string): string {
  try {
    return new URL(url, window.location.href).origin;
  } catch {
    return url;
  }
}

/**
 * Fetch media bytes, falling back to the same-origin proxy when the host won't
 * serve them cross-origin. Throws if neither route works.
 */
export async function fetchMediaBlob(url: string): Promise<Blob> {
  if (sameOrigin(url)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
    return await res.blob();
  }

  const origin = originOf(url);
  if (!needsProxy.has(origin)) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.blob();
    } catch {
      // CORS or network — fall through to the proxy.
    }
    needsProxy.add(origin);
  }

  const res = await fetch(mediaProxyUrl(url));
  if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
  return await res.blob();
}
