import { describe, expect, it } from "vitest";
import { isValidTimeZone, normalizeTimeZone, timeZoneOptions, zonedLocalToUtc } from "../src/lib/timezone";
import { actionSchemas, isAction } from "../src/server/editorial/validation";
import { canTransition } from "../src/lib/workflow";
import { describeNotification } from "../src/server/notifications/service";
import { markReadSchema } from "../src/server/notifications/service";

describe("zonedLocalToUtc (timezone-aware scheduling)", () => {
  it("converts fixed-offset zones", () => {
    expect(zonedLocalToUtc("2026-12-01T09:30", "Asia/Kolkata").toISOString()).toBe("2026-12-01T04:00:00.000Z"); // +05:30
    expect(zonedLocalToUtc("2026-12-01T09:30", "UTC").toISOString()).toBe("2026-12-01T09:30:00.000Z");
    expect(zonedLocalToUtc("2026-12-01T09:30", "Asia/Tokyo").toISOString()).toBe("2026-12-01T00:30:00.000Z");
  });
  it("applies daylight saving correctly on either side of the change", () => {
    expect(zonedLocalToUtc("2026-01-15T09:00", "America/New_York").toISOString()).toBe("2026-01-15T14:00:00.000Z"); // EST -5
    expect(zonedLocalToUtc("2026-07-15T09:00", "America/New_York").toISOString()).toBe("2026-07-15T13:00:00.000Z"); // EDT -4
    expect(zonedLocalToUtc("2026-07-15T09:00", "Europe/London").toISOString()).toBe("2026-07-15T08:00:00.000Z"); // BST +1
  });
  it("rejects wall-clock times that do not exist (spring-forward gap) and bad input", () => {
    expect(() => zonedLocalToUtc("2026-03-08T02:30", "America/New_York")).toThrow(/does not exist/);
    expect(() => zonedLocalToUtc("2026-12-01 09:30", "UTC")).toThrow(RangeError);
    expect(() => zonedLocalToUtc("2026-12-01T09:30", "Mars/Olympus")).toThrow(/Unknown timezone/);
  });
  it("uses the first occurrence for ambiguous (fall-back) times", () => {
    expect(zonedLocalToUtc("2026-11-01T01:30", "America/New_York").toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });
  it("validates zone names", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("Nope/Nope")).toBe(false);
  });
});

describe("editorial input validation", () => {
  it("knows the nine actions", () => {
    for (const a of ["submit", "start-review", "request-changes", "approve", "reject", "publish", "schedule", "cancel-schedule", "archive"]) expect(isAction(a)).toBe(true);
    expect(isAction("delete")).toBe(false);
    expect(isAction("__proto__")).toBe(false);
  });
  it("requires a version on every action and a real reason when declining", () => {
    expect(actionSchemas.submit.safeParse({}).success).toBe(false);
    expect(actionSchemas.submit.safeParse({ version: 0 }).success).toBe(false);
    expect(actionSchemas.publish.safeParse({ version: 3 }).success).toBe(true);
    expect(actionSchemas["request-changes"].safeParse({ version: 1, reason: "too short" }).success).toBe(false);
    expect(actionSchemas.reject.safeParse({ version: 1, reason: "Does not meet our sourcing standards." }).success).toBe(true);
  });
  it("accepts either an absolute instant or local time + timezone for scheduling, never both or neither", () => {
    const s = actionSchemas.schedule;
    expect(s.safeParse({ version: 1, scheduledFor: "2026-12-01T09:30:00+05:30" }).success).toBe(true);
    expect(s.safeParse({ version: 1, scheduledFor: "2026-12-01T09:30:00Z" }).success).toBe(true);
    expect(s.safeParse({ version: 1, localDateTime: "2026-12-01T09:30", timezone: "Asia/Kolkata" }).success).toBe(true);
    expect(s.safeParse({ version: 1, scheduledFor: "2026-12-01T09:30:00" }).success).toBe(false); // no offset = ambiguous
    expect(s.safeParse({ version: 1 }).success).toBe(false);
    expect(s.safeParse({ version: 1, localDateTime: "2026-12-01T09:30" }).success).toBe(false); // timezone missing
    expect(s.safeParse({ version: 1, scheduledFor: "2026-12-01T09:30:00Z", localDateTime: "2026-12-01T09:30", timezone: "UTC" }).success).toBe(false);
  });
});

describe("workflow rules for rejection", () => {
  it("lets editors reject an article under review, but nobody else or from other states", () => {
    expect(canTransition("IN_REVIEW", "ARCHIVED", { roles: ["EDITOR"] })).toBe(true);
    expect(canTransition("IN_REVIEW", "ARCHIVED", { roles: ["AUTHOR"] })).toBe(false);
    expect(canTransition("SUBMITTED", "ARCHIVED", { roles: ["EDITOR"] })).toBe(false);
    expect(canTransition("DRAFT", "ARCHIVED", { roles: ["ADMIN"] })).toBe(false);
  });
});

describe("notifications", () => {
  it("renders readable titles and links published stories", () => {
    expect(describeNotification("ARTICLE_PUBLISHED", { title: "Hello", slug: "hello" })).toEqual({ title: "“Hello” is now published", href: "/news/hello" });
    expect(describeNotification("REVISION_REQUESTED", { title: "T", reason: "Add sources" }).title).toContain("Add sources");
    expect(describeNotification("ARTICLE_SUBMITTED", {}).title).toMatch(/^An article/);
  });
  it("requires exactly one of ids or all", () => {
    expect(markReadSchema.safeParse({ all: true }).success).toBe(true);
    expect(markReadSchema.safeParse({ ids: ["8f14e45f-ceea-4e7b-9c1a-3d2f0e6a7b11"] }).success).toBe(true);
    expect(markReadSchema.safeParse({}).success).toBe(false);
    expect(markReadSchema.safeParse({ all: true, ids: ["8f14e45f-ceea-4e7b-9c1a-3d2f0e6a7b11"] }).success).toBe(false);
    expect(markReadSchema.safeParse({ ids: [] }).success).toBe(false);
  });
});

describe("timezone choices", () => {
  it("shows the modern name for zones browsers report under old names", () => {
    expect(normalizeTimeZone("Asia/Calcutta")).toBe("Asia/Kolkata");
    expect(normalizeTimeZone("Europe/Kiev")).toBe("Europe/Kyiv");
    expect(normalizeTimeZone("Europe/Paris")).toBe("Europe/Paris");
  });
  it("lists the browser's own zone first, common zones next, with no duplicates or invalid names", () => {
    const opts = timeZoneOptions("Asia/Calcutta", ["Asia/Calcutta", "Africa/Abidjan", "Asia/Kolkata", "Not/AZone"]);
    expect(opts[0]).toBe("Asia/Kolkata");
    expect(new Set(opts).size).toBe(opts.length);
    expect(opts).toContain("UTC");
    expect(opts).toContain("Africa/Abidjan");
    expect(opts).not.toContain("Asia/Calcutta");
    expect(opts).not.toContain("Not/AZone");
    expect(zonedLocalToUtc("2026-12-01T09:30", opts[0]!).toISOString()).toBe("2026-12-01T04:00:00.000Z");
  });
});
