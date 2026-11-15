"use client";
import Link from "next/link";
import { useState } from "react";

interface Props { articleId: string; initial: boolean; signedIn: boolean; loginHref: string }

export function BookmarkButton({ articleId, initial, signedIn, loginHref }: Props) {
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) return <Link className="btn btn--secondary btn--sm" href={loginHref}>Log in to save</Link>;

  async function toggle() {
    if (busy) return;
    const next = !saved;
    setSaved(next); setBusy(true); setError(null); // optimistic
    try {
      const res = next
        ? await fetch("/api/v1/bookmarks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ articleId }) })
        : await fetch(`/api/v1/bookmarks/${articleId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setSaved(!next); // roll back
      setError("Couldn’t update your saved articles. Please try again.");
    } finally { setBusy(false); }
  }

  return (
    <span className="bookmark">
      <button type="button" className={`btn btn--sm ${saved ? "btn--primary" : "btn--secondary"}`} aria-pressed={saved} onClick={toggle} disabled={busy}>
        <span aria-hidden="true">{saved ? "★" : "☆"}</span> {saved ? "Saved" : "Save"}
      </button>
      <span className="visually-hidden" role="status" aria-live="polite">{saved ? "Saved to your bookmarks" : "Removed from your bookmarks"}</span>
      {error ? <span className="auth__field-error" role="alert">{error}</span> : null}
    </span>
  );
}
