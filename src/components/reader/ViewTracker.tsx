"use client";
import { useEffect } from "react";

/**
 * Reports one article view after the page has been visible for a few seconds (once per tab session).
 * The server de-duplicates per viewer per day, so this is best-effort and must never disturb reading.
 */
export function ViewTracker({ articleId, delayMs = 3000 }: { articleId: string; delayMs?: number }) {
  useEffect(() => {
    const key = `view:${articleId}`;
    try { if (sessionStorage.getItem(key)) return; } catch { /* storage unavailable: still report, server de-duplicates */ }
    let timer: number | undefined;
    const arm = () => {
      window.clearTimeout(timer);
      if (document.visibilityState !== "visible") return;
      timer = window.setTimeout(() => {
        fetch("/api/v1/analytics/views", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ articleId }), keepalive: true })
          .then((r) => { if (r.ok) try { sessionStorage.setItem(key, "1"); } catch { /* ignore */ } })
          .catch(() => { /* analytics is best-effort */ });
      }, delayMs);
    };
    arm();
    document.addEventListener("visibilitychange", arm);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", arm); };
  }, [articleId, delayMs]);
  return null;
}
