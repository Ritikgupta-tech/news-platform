import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CampaignForm } from "@/components/admin/CampaignForm";
import { CampaignSchedule } from "@/components/admin/CampaignSchedule";
import { ActionButton } from "@/components/reader/ActionButton";
import { requirePageAccess } from "@/server/auth/page-guard";
import { getDeps } from "@/server/container";
import { getCampaign } from "@/server/newsletter/campaigns";

export const metadata: Metadata = { title: "Campaign", robots: { index: false } };
export const dynamic = "force-dynamic";

const utc = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") + " UTC" : "—");

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requirePageAccess(`/admin/newsletters/campaigns/${id}`, "newsletter:manage");
  if ("denied" in access) return access.denied;
  const c = await getCampaign(getDeps(), access.ctx, id).catch((e: { status?: number }) => { if (e.status === 404) notFound(); throw e; });
  const n = c.counts;

  return (
    <div className="stack narrow">
      <p><Link href="/admin/newsletters/campaigns">← All campaigns</Link></p>
      <div className="page-head"><h1>{c.subject}</h1><p className="muted">Status: <strong>{c.status.charAt(0) + c.status.slice(1).toLowerCase()}</strong>{c.scheduledAt ? ` · scheduled ${utc(c.scheduledAt)}` : ""}{c.sentAt ? ` · finished ${utc(c.sentAt)}` : ""}</p></div>

      {n.total > 0 ? (
        <ul className="stat-grid" aria-label="Delivery progress">
          <li className="stat"><span className="stat__n">{n.sent}</span><span className="stat__l">Sent to the mail provider</span></li>
          <li className="stat"><span className="stat__n">{n.pending + n.sending}</span><span className="stat__l">Waiting</span></li>
          <li className="stat"><span className="stat__n">{n.failed}</span><span className="stat__l">Failed</span></li>
          <li className="stat"><span className="stat__n">{n.skipped}</span><span className="stat__l">Skipped (unsubscribed or cancelled)</span></li>
        </ul>
      ) : null}
      {n.total > 0 ? <p className="muted">“Sent” means the provider accepted the message. Bounces and spam complaints that happen later are not tracked yet.</p> : null}

      {c.failures.length ? (
        <section aria-labelledby="f-h" className="stack"><h2 id="f-h">Failed deliveries</h2>
          <div className="table-wrap"><table className="data-table">
            <caption className="visually-hidden">First failed deliveries and the reason</caption>
            <thead><tr><th scope="col">Email</th><th scope="col">Attempts</th><th scope="col">Reason</th></tr></thead>
            <tbody>{c.failures.map((f) => <tr key={f.id}><th scope="row">{f.email}</th><td>{f.attempts}</td><td>{f.error ?? "—"}</td></tr>)}</tbody>
          </table></div>
        </section>
      ) : null}

      {c.status === "DRAFT" ? (
        <>
          <section aria-labelledby="e-h" className="stack"><h2 id="e-h">Message</h2><CampaignForm campaign={{ id: c.id, subject: c.subject, bodyText: c.bodyText, version: c.version }} /></section>
          <section aria-labelledby="t-h" className="stack"><h2 id="t-h">Test</h2>
            <p className="muted">Sends the saved draft to your own address only, without an unsubscribe link. Save changes first.</p>
            <div><ActionButton endpoint={`/api/v1/admin/newsletter/campaigns/${c.id}/test`} method="POST" label="Send me a test" variant="secondary" doneMessage="Test sent to your address." /></div>
          </section>
          <section aria-labelledby="s-h" className="stack"><h2 id="s-h">Send</h2><CampaignSchedule id={c.id} activeSubscribers={c.activeSubscribers} /></section>
        </>
      ) : (
        <section aria-labelledby="m-h" className="stack"><h2 id="m-h">Message</h2><pre className="plain-pre">{c.bodyText}</pre></section>
      )}

      {c.status === "SCHEDULED" ? <div><ActionButton endpoint={`/api/v1/admin/newsletter/campaigns/${c.id}/cancel`} method="POST" label="Back to draft" variant="secondary" confirm="Cancel the schedule and return this to a draft?" /></div> : null}
      {c.status === "SENDING" ? <div><ActionButton endpoint={`/api/v1/admin/newsletter/campaigns/${c.id}/cancel`} method="POST" label="Stop sending" variant="danger" confirm="Stop now? Emails already handed to the provider cannot be recalled." /></div> : null}
    </div>
  );
}
