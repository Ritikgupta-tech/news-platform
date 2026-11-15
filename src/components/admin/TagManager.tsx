"use client";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { ActionButton } from "@/components/reader/ActionButton";
import { errorMessage } from "./api";

export interface TagRow { id: string; slug: string; name: string; articleCount: number }

export function TagManager({ tags }: { tags: TagRow[] }) {
  const router = useRouter();
  const uid = useId();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/v1/tags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      if (!res.ok) { setMsg({ ok: false, text: await errorMessage(res) }); return; }
      setName(""); setMsg({ ok: true, text: "Tag created." });
      router.refresh();
    } catch { setMsg({ ok: false, text: "Network error. Please try again." }); } finally { setBusy(false); }
  }

  return (
    <div className="stack">
      <form onSubmit={create} className="inline-form" aria-label="Add a tag">
        <div className="auth__field"><label htmlFor={`${uid}-n`}>New tag</label><input id={`${uid}-n`} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={40} /></div>
        <button type="submit" className="btn btn--primary btn--md" disabled={busy}>{busy ? "Adding…" : "Add tag"}</button>
      </form>
      {msg ? <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "muted" : "auth__field-error"}>{msg.text}</p> : null}
      <div className="table-wrap">
        <table className="data-table">
          <caption className="visually-hidden">Tags</caption>
          <thead><tr><th scope="col">Name</th><th scope="col">Slug</th><th scope="col">Articles</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {tags.map((t) => (
              <tr key={t.id}>
                <th scope="row">{t.name}</th><td>{t.slug}</td><td>{t.articleCount}</td>
                <td><ActionButton endpoint={`/api/v1/tags/${t.id}`} method="DELETE" label="Delete" ariaLabel={`Delete tag ${t.name}`} variant="danger" confirm={t.articleCount ? `Delete ${t.name}? It will be removed from ${t.articleCount} article(s).` : `Delete ${t.name}?`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
