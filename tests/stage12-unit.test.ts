import { describe, expect, it } from "vitest";
import { buildRss, xmlEscape } from "../src/lib/rss";
import { parseSort } from "../src/lib/search";
import type { ArticleSummary } from "../src/types/news";

const art = (over: Partial<ArticleSummary> = {}): ArticleSummary => ({
  id: "1", slug: "a-story", title: "Tom & Jerry <win> \"big\"", summary: "It's a <b>summary</b>",
  category: { slug: "world", name: "World" }, author: { slug: "x", name: "Ann", avatarUrl: null },
  publishedAt: "2026-11-10T08:30:00.000Z", readingMinutes: 3, isBreaking: false, image: null, ...over,
});

describe("rss", () => {
  it("escapes markup and strips characters XML forbids", () => {
    expect(xmlEscape(`a&b<c>"d"'e'`)).toBe("a&amp;b&lt;c&gt;&quot;d&quot;&apos;e&apos;");
    expect(xmlEscape("ok\u0000\u0008\u001fend")).toBe("okend");
  });
  it("builds a feed with absolute links, RFC 822 dates and no raw markup from content", () => {
    const xml = buildRss([art(), art({ id: "2", slug: "second", title: "Plain" })], { base: "https://news.example", title: "E News", description: "d", now: new Date("2026-11-15T00:00:00Z") });
    expect(xml).toContain("<link>https://news.example/news/a-story</link>");
    expect(xml).toContain("<pubDate>Tue, 10 Nov 2026 08:30:00 GMT</pubDate>");
    expect(xml).toContain("Tom &amp; Jerry &lt;win&gt;");
    expect(xml).not.toContain("<b>");
    expect((xml.match(/<item>/g) ?? []).length).toBe(2);
  });
  it("is still valid with no articles", () => {
    expect(buildRss([], { base: "https://news.example", title: "E", description: "d", now: new Date("2026-11-15T00:00:00Z") })).toContain("<lastBuildDate>Sun, 15 Nov 2026");
  });
});

describe("search sort", () => {
  it("defaults to relevance and accepts only 'latest' as an alternative", () => {
    expect(parseSort(undefined)).toBe("relevance");
    expect(parseSort("latest")).toBe("latest");
    expect(parseSort("; drop table")).toBe("relevance");
    expect(parseSort(["latest", "x"])).toBe("latest");
  });
});
