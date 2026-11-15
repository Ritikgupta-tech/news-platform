"use client";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { errorMessage } from "./api";

/** Pick a time (your browser's time zone; the UTC instant is shown before you confirm) or send at the next job run. */
export function CampaignSchedule({ id, activeSubscribers }: { id: string; activeSubscribers: number }) {
  const router = useRouter();
  const uid = useId();
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const instant = when ? new Date(when) : null;
  const valid = instant && !Number.isNaN(instant.getTime());

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/v1/admin/newsletter/campaigns/${id}/schedule`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(valid ? { scheduledAt: instant.toISOString() } : {}) });
      if (!res.ok) { setMsg(await errorMessage(res)); return; }
      router.refresh();
    } catch { setMsg("Network error. Please try again."); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="stack" aria-label="Schedule sending">
      <p className="muted">{activeSubscribers} active {activeSubscribers === 1 ? "subscriber" : "subscribers"} would receive this. Only people who confirmed their address are ever included, and anyone who unsubscribes before their copy is sent is skipped.</p>
      <div className="auth__field">
        <label htmlFor={`${uid}-w`}>Send at (leave empty to send as soon as the next send job runs)</label>
        <input id={`${uid}-w`} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        {valid ? <p className="auth__hint" role="status">That is {instant.toUTCString().replace("GMT", "UTC")}.</p> : null}
      </div>
      {msg ? <p role="alert" className="auth__field-error">{msg}</p> : null}
      <div><button type="submit" className="btn btn--primary btn--md" disabled={busy}>{busy ? "Scheduling…" : valid ? "Schedule campaign" : "Send at next run"}</button></div>
    </form>
  );
}
