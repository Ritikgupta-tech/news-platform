import type { Metadata } from "next";
import Link from "next/link";
import { CampaignStatus } from "@prisma/client";
import { Pagination } from "@/components/news/Pagination";
import { ButtonLink } from "@/components/ui/Button";
import { StateMessage } from "@/components/ui/StateMessage";
import { requirePageAccess } from "@/server/auth/page-guard";
import { getDeps } from "@/server/container";
import { listCampaigns, listCampaignsQuery } from "@/server/newsletter/campaigns";

export const metadata: Metadata = { title: "Newsletter campaigns", robots: { index: false } };
export const dynamic = "force-dynamic";

const STATUSES = Object.values(CampaignStatus);
const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const utc = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") + " UTC" : "—");

export default async function AdminCampaigns({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const access = await requirePageAccess("/admin/newsletters/campaigns", "newsletter:manage");
  if ("denied" in access) return access.denied;
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === sp.status);
  const parsed = listCampaignsQuery.safeParse({ status, page: sp.page, pageSize: 20 });
  const q = parsed.success ? parsed.data : listCampaignsQuery.parse({ pageSize: 20 });
  const { items, meta } = await listCampaigns(getDeps(), access.ctx, q);

  return (
    <div className="stack">
      <div className="page-head"><h1>Newsletter campaigns</h1><ButtonLink href="/admin/newsletters/campaigns/new" variant="primary">New campaign</ButtonLink></div>
      <nav className="tabs" aria-label="Newsletter sections">
        <Link href="/admin/newsletters">Subscribers</Link>
        <Link href="/admin/newsletters/campaigns" aria-current="page">Campaigns</Link>
      </nav>
      <nav className="tabs" aria-label="Filter by status">
        <Link href="/admin/newsletters/campaigns" aria-current={!status ? "page" : undefined}>All</Link>
        {STATUSES.map((s) => <Link key={s} href={`/admin/newsletters/campaigns?status=${s}`} aria-current={status === s ? "page" : undefined}>{label(s)}</Link>)}
      </nav>
      {items.length ? (
        <div className="table-wrap"><table className="data-table">
          <caption className="visually-hidden">Newsletter campaigns, newest first</caption>
          <thead><tr><th scope="col">Subject</th><th scope="col">Status</th><th scope="col">Scheduled</th><th scope="col">Sent / recipients</th><th scope="col">Failed</th></tr></thead>
          <tbody>{items.map((c) => (
            <tr key={c.id}>
              <th scope="row"><Link href={`/admin/newsletters/campaigns/${c.id}`}>{c.subject}</Link></th>
              <td>{label(c.status)}</td><td>{utc(c.scheduledAt)}</td>
              <td>{c.counts.total ? `${c.counts.sent} / ${c.counts.total}` : "—"}</td><td>{c.counts.failed || "—"}</td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <StateMessage kind="empty" title="No campaigns yet">Write your first newsletter. Nothing is sent until you schedule it.</StateMessage>}
      <Pagination basePath="/admin/newsletters/campaigns" page={meta.page} totalPages={meta.totalPages} params={status ? { status } : {}} />
    </div>
  );
}
