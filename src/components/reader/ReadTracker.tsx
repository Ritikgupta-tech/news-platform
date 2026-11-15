"use client";
import { useEffect } from "react";

/** After the article has been open and visible for a few seconds, records it in the reader's private history (once per tab session). */
export function ReadTracker({ articleId, delayMs = 5000 }: { articleId: string; delayMs?: number }) {
  useEffect(() => {
    const key = `read:${articleId}`;
    try { if (sessionStorage.getItem(key)) return; } catch { /* storage unavailable: still record */ }
    let timer: number | undefined;
    const arm = () => {
      window.clearTimeout(timer);
      if (document.visibilityState !== "visible") return;
      timer = window.setTimeout(() => {
        fetch("/api/v1/reading-history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ articleId }), keepalive: true })
          .then((r) => { if (r.ok) try { sessionStorage.setItem(key, "1"); } catch { /* ignore */ } })
          .catch(() => { /* history is best-effort and must never disturb reading */ });
      }, delayMs);
    };
    arm();
    document.addEventListener("visibilitychange", arm);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", arm); };
  }, [articleId, delayMs]);
  return null;
}
