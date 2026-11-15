/**
 * DEV/TEST ONLY in-memory ContentRepository. Placeholder content, never imported by production code.
 * Used by unit tests and the visual harness (which alias "@/lib/content" to this file).
 */
import { buildPageMeta } from "@/lib/api/pagination";
import { rankTrending } from "@/lib/trending";
import type { ArticleSummary, RankedArticle } from "@/types/news";
import type { ArticleDetail, AuthorView, CategoryView, ContentRepository, Paged } from "@/lib/content/types";
import { PREVIEW_NOW } from "./fixtures";

const CATS: CategoryView[] = ["World", "Business", "Technology", "Health", "Sports", "Entertainment", "Science"].map((n) => ({ slug: n.toLowerCase(), name: n, icon: null }));
const AUTHORS: AuthorView[] = [
  { slug: "asha-verma", name: "Asha Verma", bio: "Placeholder author biography used for layout testing.", avatarUrl: null, twitter: null },
  { slug: "rohan-iyer", name: "Rohan Iyer", bio: null, avatarUrl: null, twitter: null },
];

function img(h: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h} 60% 38%)"/><stop offset="1" stop-color="hsl(${(h + 40) % 360} 65% 62%)"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/></svg>`;
  return { url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, alt: "Preview placeholder image" };
}

const BODY = `<p>Placeholder paragraph one. This text exists only to test article typography, spacing and line length.</p>
<h2>First section heading</h2><p>Placeholder paragraph. ${"More placeholder words to lengthen the page. ".repeat(12)}</p>
<blockquote>Placeholder pull quote used to test blockquote styling.</blockquote>
<h2>Second section heading</h2><p>${"Additional placeholder text for the second section. ".repeat(12)}</p><ul><li>List item one</li><li>List item two</li></ul>
<h3>A sub-heading</h3><p>${"Closing placeholder text. ".repeat(10)}</p>
<h2>Third section heading</h2><p>${"Final placeholder paragraph. ".repeat(10)}</p>`;

const RAW = Array.from({ length: 14 }, (_, i) => {
  const cat = CATS[i % CATS.length]!;
  const author = AUTHORS[i % 2]!;
  return {
    id: `m${i + 1}`, slug: `sample-${i + 1}`,
    title: `Sample article ${i + 1}: placeholder headline for ${cat.name.toLowerCase()} coverage`,
    summary: "Placeholder summary used for layout, clamping and pagination tests. Not real reporting.",
    category: { slug: cat.slug, name: cat.name },
    author: { slug: author.slug, name: author.name },
    publishedAt: new Date(PREVIEW_NOW.getTime() - (i + 1) * 5 * 3_600_000).toISOString(),
    readingMinutes: 3 + (i % 5), image: img((i * 47) % 360), isBreaking: i === 0,
  } satisfies ArticleSummary;
});

export function makeMemoryRepository(articles: ArticleSummary[] = RAW, opts: { promo?: boolean } = {}): ContentRepository {
  const sorted = [...articles].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const page = (list: ArticleSummary[], p: number, size: number): Paged<ArticleSummary> => ({ items: list.slice((p - 1) * size, p * size), meta: buildPageMeta({ page: p, pageSize: size }, list.length) });
  const idx = (slug: string) => sorted.findIndex((a) => a.slug === slug);
  return {
    async listLatest({ page: p, pageSize, categorySlug, authorSlug }) {
      return page(sorted.filter((a) => (!categorySlug || a.category.slug === categorySlug) && (!authorSlug || a.author.slug === authorSlug)), p, pageSize);
    },
    async listHero(limit) { return sorted.slice(0, limit); },
    async listFeatured(limit) { return sorted.slice(3, 3 + limit); },
    async listMostViewed(limit): Promise<RankedArticle[]> { return sorted.slice(0, limit).map((a, i) => ({ ...a, views: 50_000 - i * 7_300 })); },
    async listTrending(limit): Promise<RankedArticle[]> {
      const ranked = rankTrending(sorted.map((a) => ({ ...a, uniqueViews7d: 100, engagementPoints7d: 10, publishedAt: new Date(a.publishedAt) })), PREVIEW_NOW, limit);
      return ranked.map(({ uniqueViews7d: _v, engagementPoints7d: _e, publishedAt, ...rest }) => ({ ...rest, publishedAt: publishedAt.toISOString() }));
    },
    async getArticle(slug): Promise<ArticleDetail | null> {
      const a = sorted.find((x) => x.slug === slug);
      if (!a) return null;
      return { ...a, subtitle: "Placeholder subheadline that adds context beneath the main headline", bodyHtml: BODY, updatedAt: a.publishedAt, imageCaption: "Placeholder caption for the lead image.", imageCredit: "Placeholder credit", tags: [{ slug: "sample", name: "Sample" }], author: { ...a.author, bio: AUTHORS.find((x) => x.slug === a.author.slug)?.bio ?? null }, source: null };
    },
    async listRelated(slug, limit) { const a = sorted.find((x) => x.slug === slug); return a ? sorted.filter((x) => x.category.slug === a.category.slug && x.slug !== slug).slice(0, limit) : []; },
    async getAdjacent(slug) { const i = idx(slug); return i < 0 ? { previous: null, next: null } : { previous: sorted[i + 1] ?? null, next: sorted[i - 1] ?? null }; },
    async listCategories() { return CATS; },
    async getCategory(slug) { return CATS.find((c) => c.slug === slug) ?? null; },
    async search({ q, page: p, pageSize }) { const n = q.toLowerCase(); return page(sorted.filter((a) => `${a.title} ${a.summary}`.toLowerCase().includes(n)), p, pageSize); },
    async getAuthor(slug) { return AUTHORS.find((a) => a.slug === slug) ?? null; },
    async getPromo() { return opts.promo === false ? null : { eyebrow: "Sample promotion", title: "Promotional banner managed from the CMS", body: "Placeholder copy.", ctaLabel: "Learn more", ctaHref: "/about" }; },
    async listSitemapEntries(limit) { return sorted.slice(0, limit).map((a) => ({ slug: a.slug, updatedAt: a.publishedAt })); },
  };
}

const repo = makeMemoryRepository();
export function getContent(): ContentRepository { return repo; }
export type { ContentRepository };
