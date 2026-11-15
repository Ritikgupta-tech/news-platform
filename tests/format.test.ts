import { describe, expect, it } from "vitest";
import { compactNumber, formatRelative } from "@/lib/format";

describe("format", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  it("formats relative times", () => {
    expect(formatRelative("2026-11-10T11:59:40Z", now)).toBe("Just now");
    expect(formatRelative("2026-11-10T11:30:00Z", now)).toBe("30 min ago");
    expect(formatRelative("2026-11-10T09:00:00Z", now)).toBe("3 hr ago");
    expect(formatRelative("2026-11-08T12:00:00Z", now)).toBe("2 days ago");
  });
  it("falls back to a date after a week and handles invalid input", () => {
    expect(formatRelative("2026-10-01T00:00:00Z", now, "UTC")).toMatch(/2026/);
    expect(formatRelative("not-a-date", now)).toBe("");
  });
  it("compacts numbers", () => {
    expect(compactNumber(950)).toBe("950");
    expect(compactNumber(1200)).toBe("1.2K");
    expect(compactNumber(1_500_000)).toBe("1.5M");
  });
});
