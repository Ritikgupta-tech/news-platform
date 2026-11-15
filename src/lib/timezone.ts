/** Offset (ms) of `tz` from UTC at the given instant. Positive east of Greenwich. */
function offsetMs(date: Date, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts["year"]!, +parts["month"]! - 1, +parts["day"]!, +parts["hour"]!, +parts["minute"]!, +parts["second"]!);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Converts a wall-clock time ("2026-12-01T09:30") in an IANA timezone to the UTC instant, DST-aware.
 * Throws RangeError for times that do not exist in that zone (the hour skipped by a spring-forward change).
 * For ambiguous times (autumn fall-back) the first occurrence is used.
 */
export function zonedLocalToUtc(local: string, tz: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) throw new RangeError("Expected YYYY-MM-DDTHH:mm");
  if (!isValidTimeZone(tz)) throw new RangeError("Unknown timezone");
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const first = wall - offsetMs(new Date(wall), tz);
  const result = new Date(wall - offsetMs(new Date(first), tz));
  // Round trip: the zone must show the same wall-clock time, otherwise it fell into a DST gap.
  const back = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(result).map((p) => [p.type, p.value]),
  );
  const shown = `${back["year"]}-${back["month"]}-${back["day"]}T${back["hour"]}:${back["minute"]}`;
  if (shown !== local) throw new RangeError("That local time does not exist in this timezone (daylight-saving gap)");
  return result;
}

/** Older IANA names that browsers still report, mapped to the names people expect to see. */
const ALIASES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata", "Asia/Katmandu": "Asia/Kathmandu", "Asia/Saigon": "Asia/Ho_Chi_Minh", "Asia/Rangoon": "Asia/Yangon",
  "Asia/Dacca": "Asia/Dhaka", "Europe/Kiev": "Europe/Kyiv", "Atlantic/Faeroe": "Atlantic/Faroe", "Pacific/Truk": "Pacific/Chuuk",
};
export const normalizeTimeZone = (tz: string): string => ALIASES[tz] ?? tz;

/** Commonly used zones first (India first, since that is our core audience), then every zone the browser knows. */
const COMMON = ["Asia/Kolkata", "UTC", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo", "Europe/London", "Europe/Paris", "America/New_York", "America/Chicago", "America/Los_Angeles", "Australia/Sydney"];
export function timeZoneOptions(browserZone: string, all: readonly string[]): string[] {
  const merged = [normalizeTimeZone(browserZone), ...COMMON, ...all.map(normalizeTimeZone)].filter(isValidTimeZone);
  return [...new Set(merged)];
}
