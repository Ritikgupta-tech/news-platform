"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  endpoint: string;
  method: "POST" | "PATCH" | "DELETE";
  label: string;
  body?: unknown;
  /** Ask "Are you sure?" inline before doing it. */
  confirm?: string;
  variant?: "ghost" | "secondary" | "danger";
  ariaLabel?: string;
  /** Message shown next to the button after success. */
  doneMessage?: string;
}

export function ActionButton({ endpoint, method, label, body, confirm, variant = "ghost", ariaLabel, doneMessage }: Props) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function run() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(endpoint, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      if (!res.ok) { setError("That didn’t work. Please try again."); return; }
      setAsking(false);
      if (doneMessage) setDone(doneMessage);
      router.refresh();
    } catch { setError("Network error. Please try again."); } finally { setBusy(false); }
  }

  const cls = `btn btn--sm ${variant === "danger" ? "btn--secondary btn--danger" : variant === "secondary" ? "btn--secondary" : "btn--ghost"}`;
  if (asking && confirm) {
    return (
      <span className="action-confirm" role="group" aria-label={confirm}>
        <span>{confirm}</span>
        <button type="button" className="btn btn--sm btn--secondary btn--danger" onClick={run} disabled={busy}>{busy ? "Working…" : "Yes, continue"}</button>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => setAsking(false)}>Cancel</button>
        {error ? <span className="auth__field-error" role="alert">{error}</span> : null}
      </span>
    );
  }
  return (
    <span className="action-wrap">
      <button type="button" className={cls} aria-label={ariaLabel} onClick={() => (confirm ? setAsking(true) : void run())} disabled={busy}>{busy ? "Working…" : label}</button>
      {done ? <span className="muted" role="status">{done}</span> : null}
      {error ? <span className="auth__field-error" role="alert">{error}</span> : null}
    </span>
  );
}
