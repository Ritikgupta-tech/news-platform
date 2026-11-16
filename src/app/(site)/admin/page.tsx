import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
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
    <div className="stack admin-dashboard">
      <div className="page-head admin-page-head">
        <div>
          <h1 className="admin-title">Newsroom Intelligence & Executive Operations</h1>
          <p className="admin-subtitle">Live publishing metrics, reader engagement, and platform performance</p>
        </div>
        <nav className="tabs admin-range-tabs" aria-label="Date range">
          {RANGES.map((r) => (
            <Link
              key={r.days}
              href={`/admin?days=${r.days}`}
              className={`tab-btn ${q.days === r.days ? "tab-btn--active" : ""}`}
              aria-current={q.days === r.days ? "page" : undefined}
            >
              {r.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="admin-overview-header">
        <h2 className="admin-section-title">Platform At A Glance</h2>
        <span className="admin-range-indicator">Window: {RANGES.find((r) => r.days === q.days)?.label ?? `${q.days} days`}</span>
      </div>

      <ul className="stat-grid admin-stats" aria-label="Platform at a glance">
        <li className="stat stat--card">
          <div className="stat__top">
            <span className="stat__l">Total Articles</span>
            <Icon name="fileText" size={18} className="stat__icon stat__icon--navy" />
          </div>
          <span className="stat__n">{d.articles.total}</span>
          <span className="stat__meta">Lifetime publications</span>
        </li>
        <li className="stat stat--card">
          <div className="stat__top">
            <span className="stat__l">Published</span>
            <span className="stat__badge stat__badge--live"><span className="stat__dot stat__dot--green" /> Live</span>
          </div>
          <span className="stat__n">{d.articles.published}</span>
          <span className="stat__meta">Indexed & public</span>
        </li>
        <li className="stat stat--card">
          <div className="stat__top">
            <span className="stat__l">Drafts</span>
            <Icon name="edit" size={18} className="stat__icon stat__icon--muted" />
          </div>
          <span className="stat__n">{d.articles.drafts}</span>
          <span className="stat__meta">In editorial queue</span>
        </li>
        <li className={`stat stat--card stat--link ${d.articles.pendingReview > 0 ? "stat--highlight" : ""}`}>
          <Link href="/admin/articles?scope=review" className="stat__link-wrapper">
            <div className="stat__top">
              <span className="stat__l">Pending Review</span>
              <span className={`stat__badge ${d.articles.pendingReview > 0 ? "stat__badge--warning" : "stat__badge--neutral"}`}>
                Review queue →
              </span>
            </div>
            <span className="stat__n">{d.articles.pendingReview}</span>
            <span className="stat__meta">Awaiting editorial sign-off</span>
          </Link>
        </li>
        <li className="stat stat--card">
          <div className="stat__top">
            <span className="stat__l">Registered Readers</span>
            <Icon name="users" size={18} className="stat__icon stat__icon--navy" />
          </div>
          <span className="stat__n">{compactNumber(d.readers.total)}</span>
          <span className="stat__meta"><span className="stat__pill-sub">+{d.readers.newInRange} new</span> in range</span>
        </li>
        <li className="stat stat--card">
          <div className="stat__top">
            <span className="stat__l">Article Views</span>
            <Icon name="chart" size={18} className="stat__icon stat__icon--gold" />
          </div>
          <span className="stat__n">{compactNumber(d.views.inRange)}</span>
          <span className="stat__meta">{RANGES.find((r) => r.days === q.days)?.label ?? `${q.days} days`}</span>
        </li>
        <li className="stat stat--card">
          <div className="stat__top">
            <span className="stat__l">Newsletter Subscribers</span>
            <Icon name="mail" size={18} className="stat__icon stat__icon--gold" />
          </div>
          <span className="stat__n">{d.subscribers.active}</span>
          <span className="stat__meta">Confirmed readership</span>
        </li>
      </ul>

      <div className="admin-grid-two">
        <section aria-labelledby="top-h" className="admin-panel">
          <div className="admin-panel__head">
            <div>
              <h2 id="top-h" className="admin-panel__title">Top Articles</h2>
              <p className="admin-panel__sub">Most read editorial stories during this period</p>
            </div>
            <Link href="/admin/analytics" className="admin-panel__link">All Analytics →</Link>
          </div>
          {d.topArticles.length ? (
            <ol className="ranked-articles">
              {d.topArticles.map((a, idx) => (
                <li key={a.id} className="ranked-articles__item">
                  <span className="ranked-articles__rank">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <div className="ranked-articles__body">
                    <Link href={`/news/${a.slug}`} className="ranked-articles__title" target="_blank">
                      {a.title}
                    </Link>
                    <div className="ranked-articles__meta">
                      <span className="ranked-articles__views">
                        <Icon name="eye" size={14} />
                        {compactNumber(a.views)} views
                      </span>
                      <span className="ranked-articles__dot">·</span>
                      <Link href={`/author/articles/${a.id}/edit`} className="ranked-articles__edit">
                        Edit story
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <StateMessage kind="empty" title="No views recorded in this period">
              {noViews ? "View counting starts with the analytics stage, so this stays empty until then." : "Try a longer date range."}
            </StateMessage>
          )}
        </section>

        <section aria-labelledby="cat-h" className="admin-panel">
          <div className="admin-panel__head">
            <div>
              <h2 id="cat-h" className="admin-panel__title">Category Performance</h2>
              <p className="admin-panel__sub">Editorial distribution and reader volume across desks</p>
            </div>
            <Link href="/admin/categories" className="admin-panel__link">Manage Desks →</Link>
          </div>
          <div className="table-wrap admin-table-wrap">
            <table className="data-table admin-table">
              <caption className="visually-hidden">Published articles and views per category</caption>
              <thead>
                <tr>
                  <th scope="col">Category Desk</th>
                  <th scope="col" className="text-right">Published</th>
                  <th scope="col" className="text-right">Readership</th>
                </tr>
              </thead>
              <tbody>
                {d.categories.map((c) => (
                  <tr key={c.id}>
                    <th scope="row" className="admin-table__category">
                      <span className="admin-table__desk-tag">{c.name}</span>
                    </th>
                    <td className="text-right">
                      <span className="admin-table__pub-badge">{c.published} stories</span>
                    </td>
                    <td className="text-right">
                      <span className="admin-table__view-count">{compactNumber(c.views)} views</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section aria-labelledby="act-h" className="admin-panel admin-panel--full">
        <div className="admin-panel__head">
          <div>
            <h2 id="act-h" className="admin-panel__title">Recent Editorial Activity</h2>
            <p className="admin-panel__sub">Live chronological ledger of administrative and editorial actions</p>
          </div>
          <Link href="/admin/audit-logs" className="admin-panel__link">Full Audit Ledger →</Link>
        </div>
        {d.recentActivity.length ? (
          <ul className="admin-activity-stream">
            {d.recentActivity.map((a) => (
              <li key={a.id} className="admin-activity-item">
                <span className="admin-activity-dot" />
                <div className="admin-activity-body">
                  <div className="admin-activity-main">
                    <span className="admin-activity-action">{a.action}</span>
                    <span className="admin-activity-actor">by <strong>{a.actorName ?? "System"}</strong></span>
                  </div>
                  <time dateTime={a.createdAt} className="admin-activity-time">{formatDate(a.createdAt)}</time>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <StateMessage kind="empty" title="Nothing yet">
            Actions will be listed here as they happen.
          </StateMessage>
        )}
      </section>
    </div>
  );
}
