import { describe, expect, it } from "vitest";
import { ENGAGEMENT_POINTS, TRENDING, rankTrending, trendingScore } from "../src/lib/trending";
import { addHeadingIds, shouldShowToc } from "../src/lib/toc";
import { parsePage, parseSearchParams } from "../src/lib/search";
import { jsonLdString } from "../src/lib/seo";
import { pageWindow } from "../src/lib/page-window";

const now = new Date("2026-11-10T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

describe("trendingScore", () => {
  it("rises with views and engagement", () => {
    const base = { engagementPoints7d: 0, publishedAt: hoursAgo(5) };
    expect(trendingScore({ ...base, uniqueViews7d: 100 }, now)).toBeGreaterThan(trendingScore({ ...base, uniqueViews7d: 10 }, now));
    expect(trendingScore({ uniqueViews7d: 10, engagementPoints7d: 20, publishedAt: hoursAgo(5) }, now)).toBeGreaterThan(trendingScore({ uniqueViews7d: 10, engagementPoints7d: 0, publishedAt: hoursAgo(5) }, now));
  });
  it("decays with age (recency halves every half-life)", () => {
    const fresh = trendingScore({ uniqueViews7d: 0, engagementPoints7d: 0, publishedAt: hoursAgo(0) }, now);
    const old = trendingScore({ uniqueViews7d: 0, engagementPoints7d: 0, publishedAt: hoursAgo(TRENDING.HALF_LIFE_HOURS) }, now);
    expect(old).toBeCloseTo(fresh / 2, 6);
  });
  it("dampens huge counts so one article cannot dominate", () => {
    const a = trendingScore({ uniqueViews7d: 1_000, engagementPoints7d: 0, publishedAt: hoursAgo(24) }, now);
    const b = trendingScore({ uniqueViews7d: 1_000_000, engagementPoints7d: 0, publishedAt: hoursAgo(24) }, now);
    expect(b / a).toBeLessThan(3);
  });
  it("caps the editor boost and ignores negatives", () => {
    const none = trendingScore({ uniqueViews7d: 0, engagementPoints7d: 0, publishedAt: hoursAgo(48) }, now);
    expect(trendingScore({ uniqueViews7d: 0, engagementPoints7d: 0, publishedAt: hoursAgo(48), editorBoost: 999 }, now) - none).toBeCloseTo(TRENDING.MAX_BOOST, 6);
    expect(trendingScore({ uniqueViews7d: -5, engagementPoints7d: -5, publishedAt: hoursAgo(48), editorBoost: -3 }, now)).toBeCloseTo(none, 6);
  });
  it("ranks deterministically with tie-breaks and a limit", () => {
    const items = [
      { id: "b", uniqueViews7d: 5, engagementPoints7d: 0, publishedAt: hoursAgo(10) },
      { id: "a", uniqueViews7d: 5, engagementPoints7d: 0, publishedAt: hoursAgo(10) },
      { id: "c", uniqueViews7d: 500, engagementPoints7d: 0, publishedAt: hoursAgo(10) },
    ];
    expect(rankTrending(items, now, 2).map((i) => i.id)).toEqual(["c", "a"]);
    expect(ENGAGEMENT_POINTS.BOOKMARK).toBeGreaterThan(ENGAGEMENT_POINTS.READ_COMPLETE);
  });
});

describe("addHeadingIds", () => {
  it("adds unique ids and builds the toc", () => {
    const r = addHeadingIds("<h2>Intro</h2><p>x</p><h2>Intro</h2><h3>Sub <em>part</em></h3>");
    expect(r.items.map((i) => i.id)).toEqual(["intro", "intro-2", "sub-part"]);
    expect(r.html).toContain('<h2 id="intro">Intro</h2>');
    expect(r.items[2]).toMatchObject({ level: 3, text: "Sub part" });
  });
  it("normalises existing ids instead of trusting them", () => {
    const r = addHeadingIds('<h2 id="x&quot; onclick=&quot;bad">Hello</h2>');
    expect(r.html).not.toContain("onclick=");
    expect(r.items[0]?.id).toMatch(/^[a-z0-9-]+$/);
  });
  it("skips empty headings and decides when to show a toc", () => {
    expect(addHeadingIds("<h2> </h2>").items).toHaveLength(0);
    const three = addHeadingIds("<h2>A</h2><h2>B</h2><h2>C</h2>").items;
    expect(shouldShowToc(three, 5)).toBe(true);
    expect(shouldShowToc(three, 2)).toBe(false);
    expect(shouldShowToc(three.slice(0, 2), 9)).toBe(false);
  });
});

describe("search input handling", () => {
  it("rejects empty and too-short queries", () => {
    expect(parseSearchParams({})).toEqual({ ok: false, reason: "empty" });
    expect(parseSearchParams({ q: "   " })).toEqual({ ok: false, reason: "empty" });
    expect(parseSearchParams({ q: "a" })).toEqual({ ok: false, reason: "too_short" });
  });
  it("normalises, strips LIKE wildcards and control chars, and caps length", () => {
    const r = parseSearchParams({ q: "  100%_off \\ \u0000 deal  " });
    expect(r).toEqual({ ok: true, q: "100 off deal", page: 1 });
    const long = parseSearchParams({ q: "x".repeat(500) });
    expect(long.ok && long.q.length).toBe(100);
  });
  it("clamps page numbers and takes the first of repeated params", () => {
    expect(parseSearchParams({ q: "ab", page: "-4" })).toMatchObject({ page: 1 });
    expect(parseSearchParams({ q: "ab", page: "99999" })).toMatchObject({ page: 100 });
    expect(parseSearchParams({ q: ["first", "second"] })).toMatchObject({ q: "first" });
    expect(parsePage("abc")).toBe(1);
    expect(parsePage(["3", "4"])).toBe(3);
  });
});

describe("jsonLdString", () => {
  it("cannot break out of a script tag", () => {
    const s = jsonLdString({ headline: "</script><script>alert(1)</script> & x" });
    expect(s).not.toContain("<");
    expect(s).not.toContain(">");
    expect(JSON.parse(s).headline).toContain("</script>");
  });
});

describe("pageWindow", () => {
  it("shows first, last and neighbours with gaps", () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(10, 20)).toEqual([1, "gap", 8, 9, 10, 11, 12, "gap", 20]);
  });
});
