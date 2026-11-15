import type { ArticleStatus } from "@prisma/client";
import { z } from "zod";
import { requirePermission, type AuthContext } from "@/server/auth/guard";
import type { Deps } from "@/server/container";

export const dashboardQuery = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

export interface AdminDashboardDto {
  rangeDays: number;
  articles: { total: number; published: number; drafts: number; pendingReview: number; byStatus: Record<string, number> };
  readers: { total: number; newInRange: number };
  /** Counts of people who confirmed their address. Always real rows: zero until the newsletter stage ships. */
  subscribers: { active: number; pending: number };
  /** One recorded view = one reader on one article on one day (see ArticleView). */
  views: { inRange: number; total: number };
  topArticles: { id: string; slug: string; title: string; views: number }[];
  categories: { id: string; name: string; published: number; views: number }[];
  recentActivity: { id: string; action: string; entityType: string; entityId: string; actorName: string | null; createdAt: string }[];
}

const startOfRange = (now: Date, days: number) => {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d;
};

/** Aggregates real database counts only. Needs analytics:view_all (editors and administrators). */
export async function getAdminDashboard(deps: Deps, ctx: AuthContext, q: z.infer<typeof dashboardQuery>): Promise<AdminDashboardDto> {
  requirePermission(ctx, "analytics:view_all");
  const from = startOfRange(deps.now(), q.days);
  const live = { deletedAt: null };
  const [byStatus, readers, newReaders, active, pending, viewsRange, viewsTotal, topViews, cats, catViews, activity] = await Promise.all([
    deps.db.article.groupBy({ by: ["status"], where: live, _count: { _all: true } }),
    deps.db.user.count({ where: { deletedAt: null } }),
    deps.db.user.count({ where: { deletedAt: null, createdAt: { gte: from } } }),
    deps.db.newsletterSubscriber.count({ where: { status: "ACTIVE" } }),
    deps.db.newsletterSubscriber.count({ where: { status: "PENDING" } }),
    deps.db.articleView.count({ where: { viewDate: { gte: from } } }),
    deps.db.articleView.count(),
    deps.db.articleView.groupBy({ by: ["articleId"], where: { viewDate: { gte: from } }, _count: { _all: true }, orderBy: { _count: { articleId: "desc" } }, take: 5 }),
    deps.db.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, _count: { select: { articles: { where: { status: "PUBLISHED", deletedAt: null } } } } } }),
    deps.db.articleView.findMany({ where: { viewDate: { gte: from } }, select: { article: { select: { categoryId: true } } } }),
    deps.db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { actor: { select: { name: true } } } }),
  ]);

  const count = (s: ArticleStatus) => byStatus.find((r) => r.status === s)?._count._all ?? 0;
  const statusMap: Record<string, number> = {};
  for (const r of byStatus) statusMap[r.status] = r._count._all;

  const titles = topViews.length
    ? await deps.db.article.findMany({ where: { id: { in: topViews.map((t) => t.articleId) } }, select: { id: true, slug: true, title: true } })
    : [];
  const topArticles = topViews.flatMap((t) => {
    const a = titles.find((x) => x.id === t.articleId);
    return a ? [{ id: a.id, slug: a.slug, title: a.title, views: t._count._all }] : [];
  });

  const viewsByCategory = new Map<string, number>();
  for (const v of catViews) viewsByCategory.set(v.article.categoryId, (viewsByCategory.get(v.article.categoryId) ?? 0) + 1);

  return {
    rangeDays: q.days,
    articles: {
      total: byStatus.reduce((n, r) => n + r._count._all, 0),
      published: count("PUBLISHED"),
      drafts: count("DRAFT"),
      pendingReview: count("SUBMITTED") + count("IN_REVIEW"),
      byStatus: statusMap,
    },
    readers: { total: readers, newInRange: newReaders },
    subscribers: { active, pending },
    views: { inRange: viewsRange, total: viewsTotal },
    topArticles,
    categories: cats.map((c) => ({ id: c.id, name: c.name, published: c._count.articles, views: viewsByCategory.get(c.id) ?? 0 })),
    recentActivity: activity.map((a) => ({ id: a.id, action: a.action, entityType: a.entityType, entityId: a.entityId, actorName: a.actor?.name ?? null, createdAt: a.createdAt.toISOString() })),
  };
}
