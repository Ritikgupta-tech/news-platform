"use client";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { errorMessage } from "./api";

interface Props { campaign?: { id: string; subject: string; bodyText: string; version: number } }

/** Create a draft, or edit one (drafts only; the version guards against two people saving over each other). */
export function CampaignForm({ campaign }: Props) {
  const router = useRouter();
  const uid = useId();
  const [subject, setSubject] = useState(campaign?.subject ?? "");
  const [body, setBody] = useState(campaign?.bodyText ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const res = campaign
        ? await fetch(`/api/v1/admin/newsletter/campaigns/${campaign.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject, body, version: campaign.version }) })
        : await fetch("/api/v1/admin/newsletter/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject, body }) });
      if (!res.ok) { setMsg({ ok: false, text: res.status === 409 ? "Someone else changed this draft. Reload the page and try again." : await errorMessage(res) }); return; }
      if (!campaign) { const json = (await res.json()) as { data: { id: string } }; router.push(`/admin/newsletters/campaigns/${json.data.id}`); return; }
      setMsg({ ok: true, text: "Draft saved." });
      router.refresh();
    } catch { setMsg({ ok: false, text: "Network error. Please try again." }); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="stack" aria-label={campaign ? "Edit campaign" : "New campaign"}>
      <div className="auth__field"><label htmlFor={`${uid}-s`}>Subject</label><input id={`${uid}-s`} value={subject} onChange={(e) => setSubject(e.target.value)} required minLength={3} maxLength={150} /></div>
      <div className="auth__field">
        <label htmlFor={`${uid}-b`}>Message</label>
        <textarea id={`${uid}-b`} value={body} onChange={(e) => setBody(e.target.value)} required minLength={20} maxLength={20000} rows={14} aria-describedby={`${uid}-h`} />
        <p id={`${uid}-h`} className="auth__hint">Plain text. A blank line starts a new paragraph, and https:// links become clickable. No HTML. An unsubscribe link is added to every email automatically.</p>
      </div>
      {msg ? <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "muted" : "auth__field-error"}>{msg.text}</p> : null}
      <div><button type="submit" className="btn btn--primary btn--md" disabled={busy}>{busy ? "Saving…" : campaign ? "Save draft" : "Create draft"}</button></div>
    </form>
  );
}
