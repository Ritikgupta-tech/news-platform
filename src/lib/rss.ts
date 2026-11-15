import type { ArticleSummary } from "@/types/news";
import { absoluteUrl } from "@/lib/seo";

/** Escapes text for XML and drops characters XML 1.0 forbids (control characters would make the whole feed invalid). */
export function xmlEscape(v: string): string {
  return v
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function buildRss(items: ArticleSummary[], opts: { base: string; title: string; description: string; now: Date }): string {
  const { base } = opts;
  const newest = items.length ? new Date(items[0]!.publishedAt) : opts.now;
  const entries = items.map((a) => {
    const url = absoluteUrl(`/news/${a.slug}`, base);
    return `    <item>
      <title>${xmlEscape(a.title)}</title>
      <link>${xmlEscape(url)}</link>
      <guid isPermaLink="true">${xmlEscape(url)}</guid>
      <pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate>
      <category>${xmlEscape(a.category.name)}</category>
      <dc:creator>${xmlEscape(a.author.name)}</dc:creator>
      <description>${xmlEscape(a.summary)}</description>
    </item>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${xmlEscape(opts.title)}</title>
    <link>${xmlEscape(absoluteUrl("/", base))}</link>
    <description>${xmlEscape(opts.description)}</description>
    <language>en</language>
    <lastBuildDate>${newest.toUTCString()}</lastBuildDate>
    <atom:link href="${xmlEscape(absoluteUrl("/feed.xml", base))}" rel="self" type="application/rss+xml" />
${entries.join("\n")}
  </channel>
</rss>
`;
}
