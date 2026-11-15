"use client";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";

const MAX = 1500;

export function CommentForm({ articleId }: { articleId: string }) {
  const id = useId();
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "ok"; text: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (body.trim().length < 2) return setMsg({ kind: "error", text: "Write at least a couple of characters." });
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/v1/articles/${articleId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
      if (res.status === 429) return setMsg({ kind: "error", text: "You’re commenting too fast. Please wait a bit." });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: { details?: { message?: string }[]; message?: string } } | null;
        return setMsg({ kind: "error", text: j?.error?.details?.[0]?.message ?? "Your comment could not be posted." });
      }
      setBody(""); setMsg({ kind: "ok", text: "Comment posted." }); router.refresh();
    } catch { setMsg({ kind: "error", text: "Network error. Please try again." }); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="stack">
      <label htmlFor={`${id}-b`}>Add a comment</label>
      <textarea id={`${id}-b`} rows={4} maxLength={MAX} value={body} onChange={(e) => setBody(e.target.value)} aria-describedby={`${id}-s`} />
      <div><Button type="submit" disabled={busy}>{busy ? "Posting…" : "Post comment"}</Button> <span className="muted">{body.length}/{MAX}</span></div>
      <p id={`${id}-s`} role="status" aria-live="polite" className={msg?.kind === "error" ? "form-status form-status--error" : "form-status"}>{msg?.text ?? ""}</p>
    </form>
  );
}
