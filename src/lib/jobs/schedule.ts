// Shared schedule helpers used by both the server-function API and the cron endpoint.
export const FREQUENCIES = ["hourly", "6h", "daily", "weekly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

// Convert a wall-clock time in a named IANA timezone into the equivalent UTC Date.
function zonedWallClockToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(asUtc));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  // Intl formats hour "24" as "00" of the next day sometimes; en-US gives 00-23.
  const shownAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offsetMs = shownAsUtc - asUtc; // (tz - utc)
  return new Date(asUtc - offsetMs);
}

// Compute the next run instant given a schedule.
// - hourly / 6h: interval-based, from `from`, ignore tz + time-of-day.
// - daily / weekly: next occurrence of run_at_local in `timezone`, strictly after `from`.
export function computeNextRun(
  frequency: Frequency,
  opts: { from?: Date; timezone?: string | null; runAtLocal?: string | null } = {},
): Date {
  const from = opts.from ?? new Date();
  if (frequency === "hourly") {
    const d = new Date(from);
    d.setUTCHours(d.getUTCHours() + 1);
    return d;
  }
  if (frequency === "6h") {
    const d = new Date(from);
    d.setUTCHours(d.getUTCHours() + 6);
    return d;
  }

  const tz = opts.timezone && opts.timezone.trim() ? opts.timezone : "UTC";
  const [hhStr = "09", mmStr = "00"] = (opts.runAtLocal ?? "09:00").split(":");
  const hh = Math.max(0, Math.min(23, Number(hhStr) || 0));
  const mm = Math.max(0, Math.min(59, Number(mmStr) || 0));

  // Get today's date components in the target tz.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(from);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  let y = get("year");
  let mo = get("month");
  let d = get("day");

  let candidate = zonedWallClockToUtc(y, mo, d, hh, mm, tz);
  const stepDays = frequency === "weekly" ? 7 : 1;
  while (candidate.getTime() <= from.getTime()) {
    const next = new Date(Date.UTC(y, mo - 1, d + stepDays));
    y = next.getUTCFullYear();
    mo = next.getUTCMonth() + 1;
    d = next.getUTCDate();
    candidate = zonedWallClockToUtc(y, mo, d, hh, mm, tz);
  }
  return candidate;
}
