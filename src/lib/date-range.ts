/**
 * Date ranges for analytics. Everything is UTC and whole days, matching how views are stored
 * (`ArticleView.viewDate` is a UTC calendar date). Both ends are inclusive.
 * No imports on purpose: this file is pure and unit-tested without a database.
 */
export const DAY_MS = 86_400_000;
export const MAX_RANGE_DAYS = 366;
export const PRESETS = { today: 1, "7d": 7, "30d": 30, "90d": 90 } as const;
export type RangePreset = keyof typeof PRESETS;

export interface DateRange {
  /** First day, 00:00 UTC. */
  from: Date;
  /** Last day, 00:00 UTC (inclusive). */
  to: Date;
  days: number;
  preset: RangePreset | null;
  /** True when the requested end date was in the future and was cut back to today. */
  clamped: boolean;
}

export type RangeResult = { ok: true; range: DateRange } | { ok: false; message: string };

export const startOfUtcDay = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
export const dayKey = (d: Date): string => d.toISOString().slice(0, 10);
export const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * DAY_MS);

/** Strict YYYY-MM-DD that is a real calendar date ("2026-02-30" is rejected, not rolled over). */
export function parseDateOnly(s: string | undefined | null): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || dayKey(d) !== s ? null : d;
}

/** Custom dates win over a preset. Default is the last 7 days. */
export function resolveRange(input: { preset?: string; from?: string; to?: string }, now: Date): RangeResult {
  const today = startOfUtcDay(now);
  if (input.from || input.to) {
    const from = parseDateOnly(input.from);
    const toRaw = input.to ? parseDateOnly(input.to) : today;
    if (!from || !toRaw) return { ok: false, message: "Dates must be real calendar dates in the form YYYY-MM-DD." };
    if (from > today) return { ok: false, message: "The start date is in the future." };
    const clamped = toRaw > today;
    const to = clamped ? today : toRaw;
    if (from > to) return { ok: false, message: "The start date must not be after the end date." };
    const days = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
    if (days > MAX_RANGE_DAYS) return { ok: false, message: `Choose a range of at most ${MAX_RANGE_DAYS} days.` };
    return { ok: true, range: { from, to, days, preset: null, clamped } };
  }
  const key = (input.preset || "7d") as string;
  if (!Object.prototype.hasOwnProperty.call(PRESETS, key)) return { ok: false, message: "Unknown range. Use today, 7d, 30d or 90d." };
  const days = PRESETS[key as RangePreset];
  return { ok: true, range: { from: addDays(today, -(days - 1)), to: today, days, preset: key as RangePreset, clamped: false } };
}

/** The period of equal length that ends the day before `range` starts (for "vs previous period"). */
export function previousRange(range: DateRange): { from: Date; to: Date } {
  const to = addDays(range.from, -1);
  return { from: addDays(to, -(range.days - 1)), to };
}

/** One entry per day in the range, zero where nothing was recorded. Never invents data. */
export function fillDaily(range: { from: Date; days: number }, rows: { date: Date; count: number }[]): { date: string; count: number }[] {
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(dayKey(r.date), (byDay.get(dayKey(r.date)) ?? 0) + r.count);
  return Array.from({ length: range.days }, (_, i) => {
    const date = dayKey(addDays(range.from, i));
    return { date, count: byDay.get(date) ?? 0 };
  });
}

/** Percentage change, or null when there is no earlier figure to compare with (never a fake 100%). */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** The last 7 days, used when a request's range is invalid and the page falls back instead of failing. */
export function defaultRange(now: Date): DateRange {
  const today = startOfUtcDay(now);
  return { from: addDays(today, -6), to: today, days: 7, preset: "7d", clamped: false };
}
