import type { Metadata } from "next";
import Link from "next/link";
import { StateMessage } from "@/components/ui/StateMessage";
import { compactNumber, formatDate } from "@/lib/format";
import { getAdminDashboard, dashboardQuery } from "@/server/admin/dashboard";
import { requirePageAccess } from "@/server/auth/page-guard";
import { getDeps } from "@/server/container";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };
export const dynamic = "force-dynamic";

const RANGES = [{ days: 1, label: "Today" }, { days: 7, label: "7 days" }, { days: 30, label: "30 days" }];

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const access = await requirePageAccess("/admin", "analytics:view_all");
  if ("denied" in access) return access.denied;
  const parsed = dashboardQuery.safeParse({ days: (await searchParams).days });
  const q = parsed.success ? parsed.data : dashboardQuery.parse({});
  const d = await getAdminDashboard(getDeps(), access.ctx, q);
  const noViews = d.views.total === 0;

  return (
    <div className="stack">
      <div className="page-head"><h1>Dashboard</h1></div>
      <nav className="tabs" aria-label="Date range">
        {RANGES.map((r) => <Link key={r.days} href={`/admin?days=${r.days}`} aria-current={q.days === r.days ? "page" : undefined}>{r.label}</Link>)}
      </nav>

      <ul className="stat-grid" aria-label="Platform at a glance">
        <li className="stat"><span className="stat__n">{d.articles.total}</span><span className="stat__l">Total articles</span></li>
        <li className="stat"><span className="stat__n">{d.articles.published}</span><span className="stat__l">Published</span></li>
        <li className="stat"><span className="stat__n">{d.articles.drafts}</span><span className="stat__l">Drafts</span></li>
        <li className="stat stat--link"><Link href="/admin/articles?scope=review"><span className="stat__n">{d.articles.pendingReview}</span><span className="stat__l">Pending review</span></Link></li>
        <li className="stat"><span className="stat__n">{compactNumber(d.readers.total)}</span><span className="stat__l">Registered readers ({d.readers.newInRange} new)</span></li>
        <li className="stat"><span className="stat__n">{compactNumber(d.views.inRange)}</span><span className="stat__l">Article views ({RANGES.find((r) => r.days === q.days)?.label ?? `${q.days} days`})</span></li>
        <li className="stat"><span className="stat__n">{d.subscribers.active}</span><span className="stat__l">Newsletter subscribers</span></li>
      </ul>

      <section aria-labelledby="top-h" className="stack">
        <h2 id="top-h">Top articles</h2>
        {d.topArticles.length ? (
          <ol className="ranked-plain">{d.topArticles.map((a) => <li key={a.id}><Link href={`/news/${a.slug}`}>{a.title}</Link> <span className="muted">· {a.views} views</span></li>)}</ol>
        ) : <StateMessage kind="empty" title="No views recorded in this period">{noViews ? "View counting starts with the analytics stage, so this stays empty until then." : "Try a longer date range."}</StateMessage>}
      </section>

      <section aria-labelledby="cat-h" className="stack">
        <h2 id="cat-h">Category performance</h2>
        <div className="table-wrap">
          <table className="data-table">
            <caption className="visually-hidden">Published articles and views per category</caption>
            <thead><tr><th scope="col">Category</th><th scope="col">Published</th><th scope="col">Views</th></tr></thead>
            <tbody>{d.categories.map((c) => <tr key={c.id}><th scope="row">{c.name}</th><td>{c.published}</td><td>{c.views}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="act-h" className="stack">
        <h2 id="act-h">Recent editorial activity</h2>
        {d.recentActivity.length ? (
          <ul className="activity">{d.recentActivity.map((a) => <li key={a.id}><code>{a.action}</code> <span className="muted">by {a.actorName ?? "system"} · <time dateTime={a.createdAt}>{formatDate(a.createdAt)}</time></span></li>)}</ul>
        ) : <StateMessage kind="empty" title="Nothing yet">Actions will be listed here as they happen.</StateMessage>}
      </section>
    </div>
  );
}
