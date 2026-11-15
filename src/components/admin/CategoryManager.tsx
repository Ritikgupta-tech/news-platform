"use client";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { ActionButton } from "@/components/reader/ActionButton";
import { errorMessage } from "./api";

export interface CategoryRow { id: string; slug: string; name: string; sortOrder: number; isActive: boolean }

export function CategoryManager({ categories }: { categories: CategoryRow[] }) {
  const router = useRouter();
  const uid = useId();
  const [name, setName] = useState("");
  const [order, setOrder] = useState("0");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/v1/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, sortOrder: Number(order) || 0, isActive: true }) });
      if (!res.ok) { setMsg({ ok: false, text: await errorMessage(res) }); return; }
      setName(""); setOrder("0"); setMsg({ ok: true, text: "Category created." });
      router.refresh();
    } catch { setMsg({ ok: false, text: "Network error. Please try again." }); } finally { setBusy(false); }
  }

  return (
    <div className="stack">
      <form onSubmit={create} className="inline-form" aria-label="Add a category">
        <div className="auth__field"><label htmlFor={`${uid}-n`}>New category name</label><input id={`${uid}-n`} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={60} /></div>
        <div className="auth__field"><label htmlFor={`${uid}-o`}>Order</label><input id={`${uid}-o`} type="number" min={0} max={1000} value={order} onChange={(e) => setOrder(e.target.value)} /></div>
        <button type="submit" className="btn btn--primary btn--md" disabled={busy}>{busy ? "Adding…" : "Add category"}</button>
      </form>
      {msg ? <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "muted" : "auth__field-error"}>{msg.text}</p> : null}
      <div className="table-wrap">
        <table className="data-table">
          <caption className="visually-hidden">Categories</caption>
          <thead><tr><th scope="col">Name</th><th scope="col">Slug</th><th scope="col">Order</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id}>
                <th scope="row">{c.name}</th><td>{c.slug}</td><td>{c.sortOrder}</td><td>{c.isActive ? "Active" : "Hidden"}</td>
                <td>
                  <span className="action-wrap">
                    <ActionButton endpoint={`/api/v1/categories/${c.id}`} method="PATCH" body={{ isActive: !c.isActive }} label={c.isActive ? "Hide" : "Show"} ariaLabel={`${c.isActive ? "Hide" : "Show"} ${c.name}`} />
                    <ActionButton endpoint={`/api/v1/categories/${c.id}`} method="DELETE" label="Delete" ariaLabel={`Delete ${c.name}`} variant="danger" confirm={`Delete ${c.name}?`} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
