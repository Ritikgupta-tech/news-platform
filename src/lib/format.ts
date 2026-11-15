const DEFAULT_LOCALE = "en-IN";

export function formatDate(iso: string, timeZone?: string, locale = DEFAULT_LOCALE): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone }).format(d);
}

/** Relative label for recent items, falling back to a date. `now` is injectable for tests. */
export function formatRelative(iso: string, now: Date = new Date(), timeZone?: string): string {
  const d = new Date(iso);
  const diffMs = now.getTime() - d.getTime();
  if (Number.isNaN(d.getTime())) return "";
  if (diffMs < 0) return formatDate(iso, timeZone);
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
  return formatDate(iso, timeZone);
}

/** 1200 -> "1.2K", 1_500_000 -> "1.5M". */
export function compactNumber(n: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
