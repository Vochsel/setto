/**
 * Timezone helpers for scheduling social posts. Posts store an absolute epoch
 * (scheduledAt, ms); the workspace picks an IANA timezone (default AEST) that we
 * use to display and to interpret the date/time inputs.
 */

export const DEFAULT_TZ = "Australia/Sydney"; // AEST/AEDT

/** A short, curated list for the settings picker (AU-first). */
export const TIMEZONES = [
  "Australia/Sydney",
  "Australia/Brisbane",
  "Australia/Adelaide",
  "Australia/Perth",
  "Pacific/Auckland",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "UTC",
];

/** Milliseconds a timezone is ahead of UTC at a given instant. */
function tzOffsetMs(utcMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const m: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") m[p.type] = Number(p.value);
  const asUTC = Date.UTC(
    m.year,
    m.month - 1,
    m.day,
    m.hour === 24 ? 0 : m.hour,
    m.minute,
    m.second,
  );
  return asUTC - utcMs;
}

/** Interpret a wall-clock date+time in `tz` and return the absolute epoch (ms). */
export function zonedToEpoch(
  date: string, // "YYYY-MM-DD"
  time: string, // "HH:MM"
  tz: string,
): number {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // Correct by the tz offset at that instant (single pass is fine off DST edges).
  return guess - tzOffsetMs(guess, tz);
}

/** Split an epoch into `{ date, time }` input values as seen in `tz`. */
export function epochToInputs(
  epoch: number,
  tz: string,
): { date: string; time: string } {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const m: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(epoch)))
    if (p.type !== "literal") m[p.type] = p.value;
  return {
    date: `${m.year}-${m.month}-${m.day}`,
    time: `${m.hour === "24" ? "00" : m.hour}:${m.minute}`,
  };
}

/** "YYYY-MM-DD" day bucket for `epoch` in `tz` (for calendar placement). */
export function dayKey(epoch: number, tz: string): string {
  return epochToInputs(epoch, tz).date;
}

/** Human time like "9:30 am" in `tz`. */
export function formatTime(epoch: number, tz: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(epoch));
}

/** Human date+time like "Fri 4 Jul, 9:30 am" in `tz`. */
export function formatDateTime(epoch: number, tz: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(epoch));
}

/** The tz abbreviation (e.g. "AEST") for display. */
export function tzAbbrev(tz: string, at: number = Date.UTC(2026, 6, 1)): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "short",
  }).formatToParts(new Date(at));
  return parts.find((p) => p.type === "timeZoneName")?.value ?? tz;
}
