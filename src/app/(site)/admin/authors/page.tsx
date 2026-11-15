import type { Metadata } from "next";
import Link from "next/link";
import { StateMessage } from "@/components/ui/StateMessage";
import { PRESETS, defaultRange, resolveRange } from "@/lib/date-range";
import { getAuthorStats } from "@/server/analytics/reports";
import { requirePageAccess } from "@/server/auth/page-guard";
import { can } from "@/lib/permissions";
import { getDeps } from "@/server/container";

export const metadata: Metadata = { title: "Authors", robots: { index: false } };
export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = { today: "Today", "7d": "7 days", "30d": "30 days", "90d": "90 days" };

export default async function AdminAuthors({ searchParams }: { searchParams: Promise<{ preset?: string }> }) {
  const access = await requirePageAccess("/admin/authors", "analytics:view_all");
  if ("denied" in access) return access.denied;
  const deps = getDeps();
  const r = resolveRange({ preset: (await searchParams).preset || undefined }, deps.now());
  const range = r.ok ? r.range : defaultRange(deps.now());
  const { items, range: shown } = await getAuthorStats(deps, access.ctx, range);
  const canManage = can(access.ctx.roles, "user:manage");

  return (
    <div className="stack">
      <div className="page-head"><h1>Authors</h1><p className="muted">Output and readership, {shown.from} to {shown.to} (UTC).</p></div>
      <nav className="tabs" aria-label="Date range">
        {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((p) => <Link key={p} href={`/admin/authors?preset=${p}`} aria-current={shown.preset === p ? "page" : undefined}>{LABEL[p]}</Link>)}
      </nav>
      {items.length ? (
        <div className="table-wrap"><table className="data-table">
          <caption className="visually-hidden">Authors with their article counts and views in the selected period</caption>
          <thead><tr><th scope="col">Author</th><th scope="col">Published</th><th scope="col">In workflow</th><th scope="col">Drafts</th><th scope="col">Views in period</th><th scope="col">Can publish directly</th></tr></thead>
          <tbody>{items.map((a) => (
            <tr key={a.userId}>
              <th scope="row">{a.slug ? <Link href={`/authors/${a.slug}`}>{a.name}</Link> : a.name}</th>
              <td>{a.published}</td><td>{a.inReview}</td><td>{a.drafts}</td><td>{a.views}</td><td>{a.canPublishDirectly ? "Yes" : "No"}</td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <StateMessage kind="empty" title="No authors yet">People appear here once they have written an article.</StateMessage>}
      {canManage ? <p className="muted">Roles and the direct-publish grant are changed under <Link href="/admin/users">Users</Link>.</p> : null}
    </div>
  );
}
