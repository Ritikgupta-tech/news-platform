import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { StateMessage } from "@/components/ui/StateMessage";
import { StatusBadge } from "@/components/editorial/StatusBadge";
import { can } from "@/lib/permissions";
import { compactNumber } from "@/lib/format";
import { requirePageAccess } from "@/server/auth/page-guard";
import { getDeps } from "@/server/container";

export const metadata: Metadata = { title: "Author dashboard", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AuthorDashboard() {
  const access = await requirePageAccess("/author/dashboard", "article:create");
  if ("denied" in access) return access.denied;
  const { ctx } = access;
  const { db } = getDeps();

  const mine = { authorId: ctx.id, deletedAt: null };
  const [byStatus, views, topViews, recent, feedback, pending] = await Promise.all([
    db.article.groupBy({ by: ["status"], where: mine, _count: { _all: true } }),
    db.articleView.count({ where: { article: mine } }),
    db.articleView.groupBy({ by: ["articleId"], where: { article: mine }, _count: { _all: true }, orderBy: { _count: { articleId: "desc" } }, take: 5 }),
    db.article.findMany({ where: mine, orderBy: { updatedAt: "desc" }, take: 5, select: { id: true, title: true, status: true, updatedAt: true } }),
    db.article.findMany({
      where: { ...mine, status: "CHANGES_REQUESTED" }, orderBy: { updatedAt: "desc" }, take: 5,
      select: { id: true, title: true, reviews: { orderBy: { createdAt: "desc" }, take: 1, select: { reason: true, reviewer: { select: { name: true } } } } },
    }),
    can(ctx.roles, "article:review") ? db.article.count({ where: { deletedAt: null, status: { in: ["SUBMITTED", "IN_REVIEW"] } } }) : Promise.resolve(null),
  ]);
  const count = (s: string) => byStatus.find((r) => r.status === s)?._count._all ?? 0;
  const total = byStatus.reduce((n, r) => n + r._count._all, 0);
  const titles = topViews.length ? await db.article.findMany({ where: { id: { in: topViews.map((t) => t.articleId) } }, select: { id: true, title: true, slug: true } }) : [];

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Author dashboard</h1>
        <ButtonLink href="/author/articles/new">New article</ButtonLink>
      </div>

      <ul className="stat-grid" aria-label="Your articles at a glance">
        <li className="stat"><span className="stat__n">{total}</span><span className="stat__l">Total articles</span></li>
        <li className="stat"><span className="stat__n">{count("PUBLISHED")}</span><span className="stat__l">Published</span></li>
        <li className="stat"><span className="stat__n">{count("SUBMITTED") + count("IN_REVIEW")}</span><span className="stat__l">Pending review</span></li>
        <li className="stat"><span className="stat__n">{compactNumber(views)}</span><span className="stat__l">Article views</span></li>
        {pending !== null ? <li className="stat stat--link"><Link href="/admin/articles?scope=review"><span className="stat__n">{pending}</span><span className="stat__l">In the review queue</span></Link></li> : null}
      </ul>

      {feedback.length ? (
        <section className="notice notice--error" aria-labelledby="fb">
          <h2 id="fb">Changes requested</h2>
          <ul className="plain-list">
            {feedback.map((a) => (
              <li key={a.id}>
                <Link href={`/author/articles/${a.id}/edit`}><strong>{a.title}</strong></Link>
                {a.reviews[0]?.reason ? <p>“{a.reviews[0].reason}” <span className="muted">— {a.reviews[0].reviewer.name}</span></p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="two-col">
        <section aria-labelledby="rc">
          <h2 id="rc">Recent articles</h2>
          {recent.length ? (
            <ul className="plain-list">
              {recent.map((a) => (
                <li key={a.id} className="row"><Link href={`/author/articles/${a.id}/edit`}>{a.title}</Link><StatusBadge status={a.status} /></li>
              ))}
            </ul>
          ) : <StateMessage kind="empty" title="No articles yet" action={<ButtonLink href="/author/articles/new">Write your first article</ButtonLink>}>Drafts you create will show up here.</StateMessage>}
          {total > 5 ? <p><Link href="/author/articles">View all articles</Link></p> : null}
        </section>
        <section aria-labelledby="tp">
          <h2 id="tp">Top-performing</h2>
          {topViews.length ? (
            <ol className="plain-list">
              {topViews.map((t) => {
                const a = titles.find((x) => x.id === t.articleId);
                return <li key={t.articleId} className="row"><span>{a ? <Link href={`/news/${a.slug}`}>{a.title}</Link> : "Removed article"}</span><span className="muted">{compactNumber(t._count._all)} views</span></li>;
              })}
            </ol>
          ) : <p className="muted">View counts appear here once your published articles are read.</p>}
        </section>
      </div>
    </div>
  );
}
