import { describe, expect, it } from "vitest";
import { addDays, dayKey, defaultRange, fillDaily, parseDateOnly, percentChange, previousRange, resolveRange } from "../src/lib/date-range";

const NOW = new Date("2026-11-16T13:45:00.000Z");
const ok = (input: Parameters<typeof resolveRange>[0]) => { const r = resolveRange(input, NOW); if (!r.ok) throw new Error(r.message); return r.range; };

describe("parseDateOnly", () => {
  it("accepts real dates and rejects everything else", () => {
    expect(parseDateOnly("2026-02-28")?.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    for (const bad of ["2026-02-30", "2026-13-01", "26-01-01", "2026-1-1", "", undefined, null, "2026-01-01T00:00", "abcd-ef-gh"]) expect(parseDateOnly(bad as string)).toBeNull();
  });
  it("accepts a leap day only in a leap year", () => {
    expect(parseDateOnly("2028-02-29")).not.toBeNull();
    expect(parseDateOnly("2026-02-29")).toBeNull();
  });
});

describe("resolveRange", () => {
  it("defaults to the last 7 days including today", () => {
    const r = ok({});
    expect([dayKey(r.from), dayKey(r.to), r.days, r.preset]).toEqual(["2026-11-10", "2026-11-16", 7, "7d"]);
  });
  it("today is one day", () => { const r = ok({ preset: "today" }); expect([dayKey(r.from), r.days]).toEqual(["2026-11-16", 1]); });
  it("30d and 90d presets", () => { expect(ok({ preset: "30d" }).days).toBe(30); expect(dayKey(ok({ preset: "90d" }).from)).toBe("2026-08-19"); });
  it("rejects unknown presets, including prototype names", () => {
    for (const p of ["1y", "", "constructor", "__proto__", "toString"]) {
      const r = resolveRange({ preset: p }, NOW);
      if (p === "") expect(r.ok).toBe(true); else expect(r.ok).toBe(false);
    }
  });
  it("custom dates are inclusive on both ends", () => {
    const r = ok({ from: "2026-11-01", to: "2026-11-03" });
    expect([r.days, r.preset, r.clamped]).toEqual([3, null, false]);
  });
  it("custom dates win over a preset", () => { expect(ok({ preset: "30d", from: "2026-11-15", to: "2026-11-16" }).days).toBe(2); });
  it("a missing end date means today", () => { expect(dayKey(ok({ from: "2026-11-10" }).to)).toBe("2026-11-16"); });
  it("clamps a future end date to today and says so", () => {
    const r = ok({ from: "2026-11-10", to: "2027-01-01" });
    expect([dayKey(r.to), r.clamped]).toEqual(["2026-11-16", true]);
  });
  it("rejects a future start, reversed dates, junk and ranges over 366 days", () => {
    expect(resolveRange({ from: "2026-11-17" }, NOW).ok).toBe(false);
    expect(resolveRange({ from: "2026-11-10", to: "2026-11-01" }, NOW).ok).toBe(false);
    expect(resolveRange({ from: "yesterday" }, NOW).ok).toBe(false);
    expect(resolveRange({ from: "2024-01-01", to: "2026-11-16" }, NOW).ok).toBe(false);
    expect(resolveRange({ from: "2025-11-16", to: "2026-11-16" }, NOW).ok).toBe(true); // exactly 366 days
  });
  it("is unaffected by the time of day", () => {
    const late = resolveRange({ preset: "today" }, new Date("2026-11-16T23:59:59.999Z"));
    expect(late.ok && dayKey(late.range.from)).toBe("2026-11-16");
  });
});

describe("previousRange, fillDaily, percentChange", () => {
  it("previous period has the same length and ends the day before", () => {
    const p = previousRange(ok({ preset: "7d" }));
    expect([dayKey(p.from), dayKey(p.to)]).toEqual(["2026-11-03", "2026-11-09"]);
  });
  it("fills missing days with zero and sums duplicates", () => {
    const r = ok({ from: "2026-11-01", to: "2026-11-04" });
    const out = fillDaily(r, [{ date: new Date("2026-11-02T00:00:00Z"), count: 5 }, { date: new Date("2026-11-02T00:00:00Z"), count: 1 }, { date: new Date("2026-12-31T00:00:00Z"), count: 9 }]);
    expect(out).toEqual([{ date: "2026-11-01", count: 0 }, { date: "2026-11-02", count: 6 }, { date: "2026-11-03", count: 0 }, { date: "2026-11-04", count: 0 }]);
  });
  it("percent change is null with no earlier figure, never a fake number", () => {
    expect(percentChange(10, 0)).toBeNull();
    expect(percentChange(15, 10)).toBe(50);
    expect(percentChange(5, 10)).toBe(-50);
    expect(percentChange(0, 10)).toBe(-100);
  });
  it("default range is the last 7 days", () => { expect(dayKey(defaultRange(NOW).from)).toBe(dayKey(addDays(NOW, -6))); });
});
