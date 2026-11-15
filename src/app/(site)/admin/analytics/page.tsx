import type { Metadata } from "next";
import Link from "next/link";
import { DailyBars } from "@/components/admin/DailyBars";
import { StateMessage } from "@/components/ui/StateMessage";
import { defaultRange, PRESETS, resolveRange } from "@/lib/date-range";
import { compactNumber } from "@/lib/format";
import { getArticleStats, getCategoryStats, getOverview } from "@/server/analytics/reports";
import { requirePageAccess } from "@/server/auth/page-guard";
import { getDeps } from "@/server/container";

export const metadata: Metadata = { title: "Analytics", robots: { index: false } };
export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = { today: "Today", "7d": "7 days", "30d": "30 days", "90d": "90 days" };

export default async function AdminAnalytics({ searchParams }: { searchParams: Promise<{ preset?: string; from?: string; to?: string }> }) {
  const access = await requirePageAccess("/admin/analytics", "analytics:view_all");
  if ("denied" in access) return access.denied;
  const sp = await searchParams;
  const deps = getDeps();
  const resolved = resolveRange({ preset: sp.preset || undefined, from: sp.from || undefined, to: sp.to || undefined }, deps.now());
  const range = resolved.ok ? resolved.range : defaultRange(deps.now());
  const [overview, articles, categories] = await Promise.all([getOverview(deps, access.ctx, range), getArticleStats(deps, access.ctx, range, 10), getCategoryStats(deps, access.ctx, range)]);
  const o = overview;
  const change = o.views.changePercent;

  return (
    <div className="stack">
      <div className="page-head"><h1>Analytics</h1><p className="muted">{o.range.from} to {o.range.to} (UTC)</p></div>
      {!resolved.ok ? <p role="alert" className="auth__error">{resolved.message} Showing the last 7 days instead.</p> : null}
      {o.range.clamped ? <p className="muted">The end date was in the future, so the report stops today.</p> : null}

      <nav className="tabs" aria-label="Date range">
        {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((p) => <Link key={p} href={`/admin/analytics?preset=${p}`} aria-current={o.range.preset === p ? "page" : undefined}>{LABEL[p]}</Link>)}
      </nav>
      <form method="get" action="/admin/analytics" className="range-form" aria-label="Custom date range">
        <div className="auth__field"><label htmlFor="af">From</label><input id="af" name="from" type="date" defaultValue={o.range.from} max={o.range.to} required /></div>
        <div className="auth__field"><label htmlFor="at">To</label><input id="at" name="to" type="date" defaultValue={o.range.to} required /></div>
        <button type="submit" className="btn btn--secondary btn--md">Apply</button>
      </form>

      <ul className="stat-grid" aria-label="Summary for the selected period">
        <li className="stat"><span className="stat__n">{compactNumber(o.views.total)}</span><span className="stat__l">Article views</span></li>
        <li className="stat"><span className="stat__n">{change === null ? "n/a" : `${change > 0 ? "+" : ""}${change}%`}</span><span className="stat__l">vs previous {o.range.days} {o.range.days === 1 ? "day" : "days"} ({compactNumber(o.views.previousPeriod)} views)</span></li>
        <li className="stat"><span className="stat__n">{o.articlesPublished}</span><span className="stat__l">Articles published</span></li>
        <li className="stat"><span className="stat__n">{o.newReaders}</span><span className="stat__l">New readers</span></li>
        <li className="stat"><span className="stat__n">{o.newSubscribers}</span><span className="stat__l">New confirmed subscribers</span></li>
      </ul>

      <section aria-labelledby="d-h" className="stack"><h2 id="d-h">Views per day</h2><DailyBars data={o.views.daily} /></section>

      <section aria-labelledby="t-h" className="stack">
        <h2 id="t-h">Top articles</h2>
        {articles.items.length ? (
          <div className="table-wrap"><table className="data-table">
            <caption className="visually-hidden">Most viewed articles in the selected period</caption>
            <thead><tr><th scope="col">Article</th><th scope="col">Category</th><th scope="col">Author</th><th scope="col">Views</th><th scope="col">Saves, comments</th></tr></thead>
            <tbody>{articles.items.map((a) => <tr key={a.id}><th scope="row">{a.status === "PUBLISHED" ? <Link href={`/news/${a.slug}`}>{a.title}</Link> : a.title}</th><td>{a.categoryName}</td><td>{a.authorName}</td><td>{a.views}</td><td>{a.engagement}</td></tr>)}</tbody>
          </table></div>
        ) : <StateMessage kind="empty" title="No views in this period">Views appear here once readers open published articles. Try a longer range.</StateMessage>}
      </section>

      <section aria-labelledby="c-h" className="stack">
        <h2 id="c-h">Category performance</h2>
        <div className="table-wrap"><table className="data-table">
          <caption className="visually-hidden">Published articles and views per category</caption>
          <thead><tr><th scope="col">Category</th><th scope="col">Published (all time)</th><th scope="col">Views in period</th></tr></thead>
          <tbody>{categories.map((c) => <tr key={c.id}><th scope="row">{c.name}</th><td>{c.published}</td><td>{c.views}</td></tr>)}</tbody>
        </table></div>
      </section>
    </div>
  );
}
