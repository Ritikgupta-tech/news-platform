import type { Metadata } from "next";
import Link from "next/link";
import { SubscriberStatus } from "@prisma/client";
import { Pagination } from "@/components/news/Pagination";
import { StateMessage } from "@/components/ui/StateMessage";
import { requirePageAccess } from "@/server/auth/page-guard";
import { getDeps } from "@/server/container";
import { listSubscribers, listSubscribersQuery } from "@/server/newsletter/service";

export const metadata: Metadata = { title: "Newsletter subscribers", robots: { index: false } };
export const dynamic = "force-dynamic";

const STATUSES = Object.values(SubscriberStatus);

export default async function AdminNewsletters({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const access = await requirePageAccess("/admin/newsletters", "newsletter:manage");
  if ("denied" in access) return access.denied;
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === sp.status);
  const parsed = listSubscribersQuery.safeParse({ status, page: sp.page, pageSize: 25 });
  const q = parsed.success ? parsed.data : listSubscribersQuery.parse({ pageSize: 25 });
  const { items, counts, meta } = await listSubscribers(getDeps(), access.ctx, q);

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Newsletter subscribers</h1>
        <p className="muted">Double opt-in: an address becomes Active only after its owner confirms by email.</p>
      </div>
      <nav className="tabs" aria-label="Newsletter sections">
        <Link href="/admin/newsletters" aria-current="page">Subscribers</Link>
        <Link href="/admin/newsletters/campaigns">Campaigns</Link>
      </nav>
      <nav className="tabs" aria-label="Filter by status">
        <Link href="/admin/newsletters" aria-current={!status ? "page" : undefined}>All</Link>
        {STATUSES.map((s) => <Link key={s} href={`/admin/newsletters?status=${s}`} aria-current={status === s ? "page" : undefined}>{s.charAt(0) + s.slice(1).toLowerCase()} ({counts[s]})</Link>)}
      </nav>
      {items.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <caption className="visually-hidden">Newsletter subscribers, newest first</caption>
            <thead><tr><th scope="col">Email</th><th scope="col">Status</th><th scope="col">Consent given (UTC)</th><th scope="col">Confirmed</th></tr></thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <td>{s.email}</td>
                  <td>{s.status.charAt(0) + s.status.slice(1).toLowerCase()}</td>
                  <td><time dateTime={s.consentAt}>{s.consentAt.slice(0, 16).replace("T", " ")}</time></td>
                  <td>{s.verifiedAt ? <time dateTime={s.verifiedAt}>{s.verifiedAt.slice(0, 16).replace("T", " ")}</time> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <StateMessage kind="empty" title="No subscribers">Nobody matches this filter yet.</StateMessage>}
      <Pagination basePath="/admin/newsletters" page={meta.page} totalPages={meta.totalPages} params={status ? { status } : {}} />
    </div>
  );
}
