import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { ConvexError } from "convex/values"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Extract a user-facing message from an error thrown by a Convex call.
 * `ConvexError` (an application error) carries its payload in `.data` — a
 * string when we threw one — which is the friendly text to show. A plain
 * `Error` is a server fault whose message is hidden in prod, so we fall back to
 * a generic string rather than leaking "Server Error / Request ID …".
 */
export function convexErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof ConvexError) {
    return typeof e.data === "string" ? e.data : fallback
  }
  return fallback
}
