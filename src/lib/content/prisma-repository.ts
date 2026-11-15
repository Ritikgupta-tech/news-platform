import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { buildPageMeta, toSkipTake } from "@/lib/api/pagination";
import { ENGAGEMENT_POINTS, rankTrending } from "@/lib/trending";
import { FTS_VECTOR_SQL } from "@/lib/search-sql";
import type { ArticleSummary, RankedArticle } from "@/types/news";
import type { PromoConfig } from "@/components/news/PromoBanner";
import type { ArticleDetail, AuthorView, CategoryView, ContentRepository, LatestOptions, Paged, SearchOptions } from "./types";

/** Only live, public articles. `publishedAt <= now` also hides scheduled items whose time has not arrived. */
function liveWhere(extra: Prisma.ArticleWhereInput = {}): Prisma.ArticleWhereInput {
  return { status: "PUBLISHED", deletedAt: null, publishedAt: { lte: new Date() }, ...extra };
}

const summarySelect = {
  id: true, slug: true, title: true, summary: true, publishedAt: true, readingMinutes: true, isBreaking: true,
  category: { select: { slug: true, name: true } },
  author: { select: { name: true, avatarUrl: true, authorProfile: { select: { slug: true } } } },
  heroImage: { select: { url: true, altText: true, width: true, height: true } },
} satisfies Prisma.ArticleSelect;

type SummaryRow = Prisma.ArticleGetPayload<{ select: typeof summarySelect }>;

function toSummary(r: SummaryRow): ArticleSummary {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    category: r.category,
    author: { slug: r.author.authorProfile?.slug ?? "", name: r.author.name, avatarUrl: r.author.avatarUrl },
    publishedAt: (r.publishedAt ?? new Date(0)).toISOString(),
    readingMinutes: r.readingMinutes,
    isBreaking: r.isBreaking,
    image: r.heroImage ? { url: r.heroImage.url, alt: r.heroImage.altText, width: r.heroImage.width ?? undefined, height: r.heroImage.height ?? undefined } : null,
  };
}

const DAY_MS = 86_400_000;

async function fetchSummaries(ids: string[]): Promise<Map<string, ArticleSummary>> {
  if (ids.length === 0) return new Map();
  const rows = await db.article.findMany({ where: liveWhere({ id: { in: ids } }), select: summarySelect });
  return new Map(rows.map((r) => [r.id, toSummary(r)]));
}

async function slotArticles(slot: "HERO" | "FEATURED", limit: number): Promise<ArticleSummary[]> {
  const now = new Date();
  const pins = await db.featuredStory.findMany({
    where: { slot, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }] },
    orderBy: { position: "asc" },
    take: limit,
    select: { articleId: true },
  });
  const map = await fetchSummaries(pins.map((p) => p.articleId));
  return pins.map((p) => map.get(p.articleId)).filter((x): x is ArticleSummary => Boolean(x));
}

export const prismaContentRepository: ContentRepository = {
  async listLatest({ page, pageSize, categorySlug, authorSlug }: LatestOptions): Promise<Paged<ArticleSummary>> {
    const where = liveWhere({
      ...(categorySlug ? { category: { slug: categorySlug } } : {}),
      ...(authorSlug ? { author: { authorProfile: { slug: authorSlug } } } : {}),
    });
    const [rows, total] = await Promise.all([
      db.article.findMany({ where, orderBy: [{ publishedAt: "desc" }, { id: "asc" }], ...toSkipTake({ page, pageSize }), select: summarySelect }),
      db.article.count({ where }),
    ]);
    return { items: rows.map(toSummary), meta: buildPageMeta({ page, pageSize }, total) };
  },

  async listHero(limit) {
    const pinned = await slotArticles("HERO", limit);
    if (pinned.length >= limit) return pinned;
    // Fall back to the newest stories, skipping those already pinned.
    const rows = await db.article.findMany({
      where: liveWhere({ id: { notIn: pinned.map((p) => p.id) }, heroImageId: { not: null } }),
      orderBy: { publishedAt: "desc" },
      take: limit - pinned.length,
      select: summarySelect,
    });
    return [...pinned, ...rows.map(toSummary)];
  },

  async listFeatured(limit) {
    return slotArticles("FEATURED", limit);
  },

  async listMostViewed(limit) {
    const since = new Date(Date.now() - 30 * DAY_MS);
    const grouped = await db.articleView.groupBy({ by: ["articleId"], where: { viewDate: { gte: since } }, _count: { _all: true }, orderBy: { _count: { articleId: "desc" } }, take: limit * 3 });
    const map = await fetchSummaries(grouped.map((g) => g.articleId));
    const out: RankedArticle[] = [];
    for (const g of grouped) {
      const a = map.get(g.articleId);
      if (a) out.push({ ...a, views: g._count._all });
      if (out.length === limit) break;
    }
    return out;
  },

  async listTrending(limit) {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
    const candidates = await db.article.findMany({
      where: liveWhere({ publishedAt: { gte: new Date(now.getTime() - 14 * DAY_MS), lte: now } }),
      orderBy: { publishedAt: "desc" },
      take: 200,
      select: { ...summarySelect, editorBoost: true },
    });
    if (candidates.length === 0) return [];
    const ids = candidates.map((c) => c.id);
    const [views, engagement] = await Promise.all([
      db.articleView.groupBy({ by: ["articleId"], where: { articleId: { in: ids }, viewDate: { gte: weekAgo } }, _count: { _all: true } }),
      db.articleEngagement.groupBy({ by: ["articleId", "type"], where: { articleId: { in: ids }, createdAt: { gte: weekAgo } }, _count: { _all: true } }),
    ]);
    const viewMap = new Map(views.map((v) => [v.articleId, v._count._all]));
    const engMap = new Map<string, number>();
    for (const e of engagement) engMap.set(e.articleId, (engMap.get(e.articleId) ?? 0) + e._count._all * ENGAGEMENT_POINTS[e.type]);
    const scored = candidates.map((c) => ({
      id: c.id, row: c, uniqueViews7d: viewMap.get(c.id) ?? 0, engagementPoints7d: engMap.get(c.id) ?? 0,
      publishedAt: c.publishedAt ?? new Date(0), editorBoost: c.editorBoost,
    }));
    return rankTrending(scored, now, limit).map((s) => ({ ...toSummary(s.row), views: s.uniqueViews7d > 0 ? s.uniqueViews7d : undefined }));
  },

  async getArticle(slug) {
    const r = await db.article.findFirst({
      where: liveWhere({ slug }),
      select: {
        ...summarySelect, subtitle: true, bodyHtml: true, updatedAt: true, sourceName: true, sourceUrl: true,
        heroImage: { select: { url: true, altText: true, width: true, height: true, caption: true, credit: true } },
        author: { select: { name: true, avatarUrl: true, authorProfile: { select: { slug: true, bio: true } } } },
        tags: { select: { tag: { select: { slug: true, name: true } } } },
      },
    });
    if (!r) return null;
    const base = toSummary(r as unknown as SummaryRow);
    return {
      ...base,
      subtitle: r.subtitle,
      bodyHtml: r.bodyHtml,
      updatedAt: r.updatedAt.toISOString(),
      imageCaption: r.heroImage?.caption ?? null,
      imageCredit: r.heroImage?.credit ?? null,
      tags: r.tags.map((t) => t.tag),
      author: { ...base.author, bio: r.author.authorProfile?.bio ?? null },
      source: r.sourceName && r.sourceUrl ? { name: r.sourceName, url: r.sourceUrl } : null,
    } satisfies ArticleDetail;
  },

  async listRelated(slug, limit) {
    const current = await db.article.findFirst({ where: liveWhere({ slug }), select: { id: true, categoryId: true } });
    if (!current) return [];
    const rows = await db.article.findMany({ where: liveWhere({ categoryId: current.categoryId, id: { not: current.id } }), orderBy: { publishedAt: "desc" }, take: limit, select: summarySelect });
    return rows.map(toSummary);
  },

  async getAdjacent(slug) {
    const current = await db.article.findFirst({ where: liveWhere({ slug }), select: { publishedAt: true } });
    if (!current?.publishedAt) return { previous: null, next: null };
    const [prev, next] = await Promise.all([
      db.article.findFirst({ where: liveWhere({ publishedAt: { lt: current.publishedAt } }), orderBy: { publishedAt: "desc" }, select: summarySelect }),
      db.article.findFirst({ where: liveWhere({ publishedAt: { gt: current.publishedAt, lte: new Date() } }), orderBy: { publishedAt: "asc" }, select: summarySelect }),
    ]);
    return { previous: prev ? toSummary(prev) : null, next: next ? toSummary(next) : null };
  },

  async listCategories() {
    const rows = await db.category.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { slug: true, name: true, icon: true } });
    return rows;
  },

  async getCategory(slug) {
    return db.category.findFirst({ where: { slug, isActive: true }, select: { slug: true, name: true, icon: true } });
  },

  async search({ q, page, pageSize, sort = "relevance" }: SearchOptions) {
    // 1) Postgres full-text search: stemmed, weighted (title > summary > body), ranked. websearch_to_tsquery never
    //    raises on odd input and every value is a bound parameter. 2) If nothing matches (e.g. a half-typed word)
    //    fall back to a plain substring match so the reader still gets something useful.
    const { skip, take } = toSkipTake({ page, pageSize });
    const live = Prisma.sql`status = 'PUBLISHED' AND "deletedAt" IS NULL AND "publishedAt" <= now()`;
    const match = Prisma.sql`${Prisma.raw(FTS_VECTOR_SQL)} @@ websearch_to_tsquery('english', ${q})`;
    const order = sort === "latest"
      ? Prisma.sql`"publishedAt" DESC, id ASC`
      : Prisma.sql`ts_rank(${Prisma.raw(FTS_VECTOR_SQL)}, websearch_to_tsquery('english', ${q})) DESC, "publishedAt" DESC, id ASC`;
    const [countRows, idRows] = await Promise.all([
      db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "Article" WHERE ${live} AND ${match}`,
      db.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM "Article" WHERE ${live} AND ${match} ORDER BY ${order} OFFSET ${skip} LIMIT ${take}`,
    ]);
    const total = Number(countRows[0]?.n ?? 0);
    if (total > 0) {
      const map = await fetchSummaries(idRows.map((r) => r.id));
      return { items: idRows.map((r) => map.get(r.id)).filter((x): x is ArticleSummary => Boolean(x)), meta: buildPageMeta({ page, pageSize }, total) };
    }
    const where = liveWhere({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { summary: { contains: q, mode: "insensitive" } },
        { bodyText: { contains: q, mode: "insensitive" } },
      ],
    });
    const [rows, count] = await Promise.all([
      db.article.findMany({ where, orderBy: [{ publishedAt: "desc" }, { id: "asc" }], skip, take, select: summarySelect }),
      db.article.count({ where }),
    ]);
    return { items: rows.map(toSummary), meta: buildPageMeta({ page, pageSize }, count) };
  },

  async getAuthor(slug) {
    const p = await db.authorProfile.findUnique({ where: { slug }, select: { slug: true, bio: true, twitter: true, user: { select: { name: true, avatarUrl: true, deletedAt: true } } } });
    if (!p || p.user.deletedAt) return null;
    return { slug: p.slug, name: p.user.name, bio: p.bio, avatarUrl: p.user.avatarUrl, twitter: p.twitter } satisfies AuthorView;
  },

  async getPromo() {
    const s = await db.siteSetting.findUnique({ where: { key: "homepage.promo" } });
    const v = s?.value as Partial<PromoConfig> | null | undefined;
    if (!v || typeof v.title !== "string" || typeof v.ctaLabel !== "string" || typeof v.ctaHref !== "string") return null;
    // Only same-site paths or https URLs are accepted as CTA targets.
    if (!(v.ctaHref.startsWith("/") && !v.ctaHref.startsWith("//")) && !v.ctaHref.startsWith("https://")) return null;
    return { title: v.title, ctaLabel: v.ctaLabel, ctaHref: v.ctaHref, eyebrow: typeof v.eyebrow === "string" ? v.eyebrow : undefined, body: typeof v.body === "string" ? v.body : undefined };
  },

  async listSitemapEntries(limit) {
    const rows = await db.article.findMany({ where: liveWhere(), orderBy: { publishedAt: "desc" }, take: limit, select: { slug: true, updatedAt: true } });
    return rows.map((r) => ({ slug: r.slug, updatedAt: r.updatedAt.toISOString() }));
  },
};
