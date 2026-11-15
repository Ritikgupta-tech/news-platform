"use client";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { normalizeTimeZone, timeZoneOptions, zonedLocalToUtc } from "@/lib/timezone";
import type { AvailableAction } from "@/server/editorial/actions";

interface Props { articleId: string; version: number; actions: AvailableAction[]; scheduledFor?: string | null }
interface Env { error?: { code?: string; message?: string; details?: { path: string; message: string }[] } }

function timezones(): string[] {
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return timeZoneOptions(here, typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : []);
}

export function EditorialPanel({ articleId, version, actions, scheduledFor }: Props) {
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState<AvailableAction | null>(null);
  const [text, setText] = useState("");
  const [local, setLocal] = useState("");
  const [tz, setTz] = useState(() => normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone));
  const zones = useMemo(timezones, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (!local) return null;
    try { return zonedLocalToUtc(local, tz); } catch (e) { return (e as Error).message; }
  }, [local, tz]);

  async function run(a: AvailableAction) {
    setError(null);
    const body: Record<string, unknown> = { version };
    if (a.input === "reason") { if (text.trim().length < 10) { setError("Please give a reason of at least 10 characters."); return; } body["reason"] = text.trim(); }
    if (a.input === "note" && text.trim()) body["note"] = text.trim();
    if (a.input === "schedule") {
      if (!local) { setError("Choose a date and time."); return; }
      if (typeof preview === "string") { setError(preview); return; }
      body["localDateTime"] = local; body["timezone"] = tz;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/articles/${articleId}/${a.action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { setOpen(null); setText(""); router.refresh(); return; }
      const e = ((await res.json().catch(() => ({}))) as Env).error;
      setError(e?.code === "VERSION_CONFLICT" ? "The article was changed by someone else. Reload the page and review it again." : e?.details?.[0]?.message ?? e?.message ?? "That didn't work. Please try again.");
    } catch { setError("Network error. Please try again."); } finally { setBusy(false); }
  }

  if (!actions.length) return <p className="auth__hint">No actions available at this stage.</p>;

  return (
    <section className="panel" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`} className="panel__title">Workflow</h2>
      {scheduledFor ? <p className="notice">Scheduled for <time dateTime={scheduledFor}>{new Date(scheduledFor).toUTCString()}</time></p> : null}
      <div className="panel__buttons">
        {actions.map((a) => (
          <Button key={a.action} variant={a.tone === "primary" ? "primary" : "secondary"} className={a.tone === "danger" ? "btn--danger" : ""} disabled={busy}
            aria-expanded={a.input !== "none" ? open?.action === a.action : undefined}
            onClick={() => { if (a.input === "none") void run(a); else { setOpen(open?.action === a.action ? null : a); setError(null); } }}>
            {a.label}
          </Button>
        ))}
      </div>

      {open && open.input !== "none" ? (
        <form className="panel__form" onSubmit={(e) => { e.preventDefault(); void run(open); }}>
          {open.input === "schedule" ? (
            <>
              <div className="auth__field">
                <label htmlFor={`${uid}-dt`}>Publish at (local time)</label>
                <input id={`${uid}-dt`} type="datetime-local" value={local} onChange={(e) => setLocal(e.target.value)} />
              </div>
              <div className="auth__field">
                <label htmlFor={`${uid}-tz`}>Timezone</label>
                <select id={`${uid}-tz`} value={tz} onChange={(e) => setTz(e.target.value)}>{zones.map((z) => <option key={z} value={z}>{z}</option>)}</select>
              </div>
              {preview instanceof Date ? <p className="auth__hint" role="status">Publishes at {preview.toUTCString().replace("GMT", "UTC")}</p> : typeof preview === "string" ? <p className="auth__field-error" role="alert">{preview}</p> : null}
            </>
          ) : (
            <div className="auth__field">
              <label htmlFor={`${uid}-txt`}>{open.input === "reason" ? "Reason (shared with the author)" : "Note (optional)"}</label>
              <textarea id={`${uid}-txt`} rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} />
            </div>
          )}
          <div className="panel__buttons">
            <Button type="submit" disabled={busy}>{busy ? "Working…" : `Confirm: ${open.label.replace("…", "")}`}</Button>
            <Button variant="ghost" onClick={() => { setOpen(null); setError(null); }}>Cancel</Button>
          </div>
        </form>
      ) : null}
      {error ? <p className="auth__error" role="alert">{error}</p> : null}
    </section>
  );
}
