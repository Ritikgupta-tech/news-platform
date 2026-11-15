import type { Metadata } from "next";
import Link from "next/link";
import { Pagination } from "@/components/news/Pagination";
import { StateMessage } from "@/components/ui/StateMessage";
import { requirePageAccess } from "@/server/auth/page-guard";
import { getDeps } from "@/server/container";
import { listAuditLogs, listAuditQuery } from "@/server/users/service";

export const metadata: Metadata = { title: "Audit log", robots: { index: false } };
export const dynamic = "force-dynamic";

const GROUPS = ["article", "category", "tag", "user", "author", "account"];

export default async function AdminAuditLogs({ searchParams }: { searchParams: Promise<{ action?: string; page?: string }> }) {
  const access = await requirePageAccess("/admin/audit-logs", "audit:view");
  if ("denied" in access) return access.denied;
  const sp = await searchParams;
  const action = GROUPS.includes(sp.action ?? "") ? sp.action : undefined; // only known prefixes reach the query
  const parsed = listAuditQuery.safeParse({ action, page: sp.page, pageSize: 25 });
  const q = parsed.success ? parsed.data : listAuditQuery.parse({ pageSize: 25 });
  const { items, meta } = await listAuditLogs(getDeps(), access.ctx, q);

  return (
    <div className="stack">
      <div className="page-head"><h1>Audit log</h1><p className="muted">Append-only record of who changed what. Entries cannot be edited or deleted here.</p></div>
      <nav className="tabs" aria-label="Filter by area">
        <Link href="/admin/audit-logs" aria-current={!action ? "page" : undefined}>All</Link>
        {GROUPS.map((g) => <Link key={g} href={`/admin/audit-logs?action=${g}`} aria-current={action === g ? "page" : undefined}>{g.charAt(0).toUpperCase() + g.slice(1)}</Link>)}
      </nav>
      {items.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <caption className="visually-hidden">Audit log entries, newest first</caption>
            <thead><tr><th scope="col">When (UTC)</th><th scope="col">Who</th><th scope="col">Action</th><th scope="col">Target</th></tr></thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td><time dateTime={a.createdAt}>{a.createdAt.slice(0, 16).replace("T", " ")}</time></td>
                  <td>{a.actor?.name ?? "System"}</td>
                  <td><code>{a.action}</code></td>
                  <td>{a.entityType} <span className="muted">{a.entityId.slice(0, 8)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <StateMessage kind="empty" title="No entries">Nothing has been recorded for this filter.</StateMessage>}
      <Pagination basePath="/admin/audit-logs" page={meta.page} totalPages={meta.totalPages} params={action ? { action } : {}} />
    </div>
  );
}
