"use client";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

export function ShareButtons({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied("ok"); } catch { setCopied("fail"); }
    window.setTimeout(() => setCopied("idle"), 2200);
  }
  return (
    <div className="share" role="group" aria-label="Share this article">
      <span className="share__label">Share</span>
      <a className="icon-btn icon-btn--bordered" href={`https://twitter.com/intent/tweet?url=${u}&text=${t}`} target="_blank" rel="noopener noreferrer" aria-label="Share on X"><Icon name="x" size={18} /></a>
      <a className="icon-btn icon-btn--bordered" href={`https://www.facebook.com/sharer/sharer.php?u=${u}`} target="_blank" rel="noopener noreferrer" aria-label="Share on Facebook"><Icon name="facebook" size={18} /></a>
      <a className="btn btn--secondary btn--sm" href={`https://wa.me/?text=${t}%20${u}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
      <button type="button" className="btn btn--secondary btn--sm" onClick={copy}>{copied === "ok" ? "Link copied" : copied === "fail" ? "Copy failed" : "Copy link"}</button>
      <span className="visually-hidden" role="status" aria-live="polite">{copied === "ok" ? "Link copied to clipboard" : copied === "fail" ? "Could not copy link" : ""}</span>
    </div>
  );
}
