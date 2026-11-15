import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { fillDaily, percentChange, previousRange, resolveRange, type DateRange } from "@/lib/date-range";
import { hasPermission, requirePermission, type AuthContext } from "@/server/auth/guard";
import type { Deps } from "@/server/container";

/** Range inputs shared by every report. Custom `from`/`to` win over `preset`. */
export const rangeQuery = z.object({
  preset: z.string().max(10).optional(),
  from: z.string().max(10).optional(),
  to: z.string().max(10).optional(),
});

export const articleReportQuery = rangeQuery.extend({ limit: z.coerce.number().int().min(1).max(50).default(10) });

export function rangeFromQuery(deps: Deps, q: z.infer<typeof rangeQuery>): DateRange {
  const r = resolveRange(q, deps.now());
  if (!r.ok) throw new ApiError(422, "VALIDATION_ERROR", r.message);
  return r.range;
}

export interface RangeDto { from: string; to: string; days: number; preset: string | null; clamped: boolean }
const rangeDto = (r: DateRange): RangeDto => ({ from: r.from.toISOString().slice(0, 10), to: r.to.toISOString().slice(0, 10), days: r.days, preset: r.preset, clamped: r.clamped });

export interface OverviewDto {
  range: RangeDto;
  /** One view = one reader on one article on one UTC day (see docs/analytics.md). */
  views: { total: number; previousPeriod: number; changePercent: number | null; daily: { date: string; count: number }[] };
  articlesPublished: number;
  newReaders: number;
  newSubscribers: number;
  engagement: { type: string; count: number }[];
}

/** Site-wide report. Editors and administrators (analytics:view_all). Real rows only; empty periods are zeros. */
export async function getOverview(deps: Deps, ctx: AuthContext, range: DateRange): Promise<OverviewDto> {
  requirePermission(ctx, "analytics:view_all");
  const prev = previousRange(range);
  const inRange = { gte: range.from, lte: range.to };
  const endExclusive = new Date(range.to.getTime() + 86_400_000);
  const [daily, previous, published, readers, subs, eng] = await Promise.all([
    deps.db.articleView.groupBy({ by: ["viewDate"], where: { viewDate: inRange }, _count: { _all: true } }),
    deps.db.articleView.count({ where: { viewDate: { gte: prev.from, lte: prev.to } } }),
    deps.db.article.count({ where: { deletedAt: null, status: "PUBLISHED", publishedAt: { gte: range.from, lt: endExclusive } } }),
    deps.db.user.count({ where: { deletedAt: null, createdAt: { gte: range.from, lt: endExclusive } } }),
    deps.db.newsletterSubscriber.count({ where: { status: "ACTIVE", verifiedAt: { gte: range.from, lt: endExclusive } } }),
    deps.db.articleEngagement.groupBy({ by: ["type"], where: { createdAt: { gte: range.from, lt: endExclusive } }, _count: { _all: true } }),
  ]);
  const series = fillDaily(range, daily.map((d) => ({ date: d.viewDate, count: d._count._all })));
  const total = series.reduce((n, d) => n + d.count, 0);
  return {
    range: rangeDto(range),
    views: { total, previousPeriod: previous, changePercent: percentChange(total, previous), daily: series },
    articlesPublished: published,
    newReaders: readers,
    newSubscribers: subs,
    engagement: eng.map((e) => ({ type: e.type, count: e._count._all })).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
  };
}

export interface ArticleStatDto { id: string; slug: string; title: string; status: string; categoryName: string; authorName: string; publishedAt: string | null; views: number; engagement: number }

/**
 * Top articles by views in the range. Editors/admins see every article; authors (analytics:view_own)
 * see only their own. Anyone else gets 403. The scope is decided here from the caller's role, never from a query parameter.
 */
export async function getArticleStats(deps: Deps, ctx: AuthContext, range: DateRange, limit: number): Promise<{ range: RangeDto; scope: "all" | "own"; items: ArticleStatDto[] }> {
  const all = hasPermission(ctx, "analytics:view_all");
  if (!all) requirePermission(ctx, "analytics:view_own");
  const scopeWhere = all ? {} : { article: { authorId: ctx.id } };
  const endExclusive = new Date(range.to.getTime() + 86_400_000);
  const top = await deps.db.articleView.groupBy({
    by: ["articleId"],
    where: { viewDate: { gte: range.from, lte: range.to }, ...scopeWhere },
    _count: { _all: true },
    orderBy: [{ _count: { articleId: "desc" } }, { articleId: "asc" }],
    take: limit,
  });
  if (top.length === 0) return { range: rangeDto(range), scope: all ? "all" : "own", items: [] };
  const ids = top.map((t) => t.articleId);
  const [articles, eng] = await Promise.all([
    deps.db.article.findMany({ where: { id: { in: ids } }, select: { id: true, slug: true, title: true, status: true, publishedAt: true, category: { select: { name: true } }, author: { select: { name: true } } } }),
    deps.db.articleEngagement.groupBy({ by: ["articleId"], where: { articleId: { in: ids }, createdAt: { gte: range.from, lt: endExclusive } }, _count: { _all: true } }),
  ]);
  const engMap = new Map(eng.map((e) => [e.articleId, e._count._all]));
  const items = top.flatMap((t) => {
    const a = articles.find((x) => x.id === t.articleId);
    return a ? [{ id: a.id, slug: a.slug, title: a.title, status: a.status, categoryName: a.category.name, authorName: a.author.name, publishedAt: a.publishedAt?.toISOString() ?? null, views: t._count._all, engagement: engMap.get(a.id) ?? 0 }] : [];
  });
  return { range: rangeDto(range), scope: all ? "all" : "own", items };
}

export interface CategoryStatDto { id: string; name: string; published: number; views: number }

/** Views per category in the range, computed in the database (not by loading every view). */
export async function getCategoryStats(deps: Deps, ctx: AuthContext, range: DateRange): Promise<CategoryStatDto[]> {
  requirePermission(ctx, "analytics:view_all");
  const [cats, perArticle] = await Promise.all([
    deps.db.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, _count: { select: { articles: { where: { status: "PUBLISHED", deletedAt: null } } } } } }),
    deps.db.articleView.groupBy({ by: ["articleId"], where: { viewDate: { gte: range.from, lte: range.to } }, _count: { _all: true } }),
  ]);
  const owners = perArticle.length ? await deps.db.article.findMany({ where: { id: { in: perArticle.map((p) => p.articleId) } }, select: { id: true, categoryId: true } }) : [];
  const catOf = new Map(owners.map((o) => [o.id, o.categoryId]));
  const views = new Map<string, number>();
  for (const p of perArticle) { const c = catOf.get(p.articleId); if (c) views.set(c, (views.get(c) ?? 0) + p._count._all); }
  return cats.map((c) => ({ id: c.id, name: c.name, published: c._count.articles, views: views.get(c.id) ?? 0 }));
}

export interface AuthorStatDto { userId: string; name: string; slug: string | null; canPublishDirectly: boolean; published: number; inReview: number; drafts: number; views: number }

/** One row per person who has written at least one article. Editors and administrators. */
export async function getAuthorStats(deps: Deps, ctx: AuthContext, range: DateRange): Promise<{ range: RangeDto; items: AuthorStatDto[] }> {
  requirePermission(ctx, "analytics:view_all");
  const [byStatus, perArticle] = await Promise.all([
    deps.db.article.groupBy({ by: ["authorId", "status"], where: { deletedAt: null }, _count: { _all: true } }),
    deps.db.articleView.groupBy({ by: ["articleId"], where: { viewDate: { gte: range.from, lte: range.to } }, _count: { _all: true } }),
  ]);
  const authorIds = [...new Set(byStatus.map((r) => r.authorId))];
  if (authorIds.length === 0) return { range: rangeDto(range), items: [] };
  const [users, owners] = await Promise.all([
    deps.db.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true, deletedAt: true, authorProfile: { select: { slug: true, canPublishDirectly: true } } } }),
    perArticle.length ? deps.db.article.findMany({ where: { id: { in: perArticle.map((p) => p.articleId) } }, select: { id: true, authorId: true } }) : Promise.resolve([]),
  ]);
  const authorOf = new Map(owners.map((o) => [o.id, o.authorId]));
  const views = new Map<string, number>();
  for (const p of perArticle) { const a = authorOf.get(p.articleId); if (a) views.set(a, (views.get(a) ?? 0) + p._count._all); }
  const n = (id: string, ...st: string[]) => byStatus.filter((r) => r.authorId === id && st.includes(r.status)).reduce((s, r) => s + r._count._all, 0);
  const items = users
    .map((u) => ({
      userId: u.id,
      name: u.deletedAt ? "Deleted user" : u.name,
      slug: u.deletedAt ? null : u.authorProfile?.slug ?? null,
      canPublishDirectly: u.authorProfile?.canPublishDirectly ?? false,
      published: n(u.id, "PUBLISHED"),
      inReview: n(u.id, "SUBMITTED", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED", "SCHEDULED"),
      drafts: n(u.id, "DRAFT"),
      views: views.get(u.id) ?? 0,
    }))
    .sort((a, b) => b.views - a.views || b.published - a.published || a.name.localeCompare(b.name));
  return { range: rangeDto(range), items };
}
