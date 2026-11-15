"use client";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { errorMessage } from "./api";

const EDITABLE = ["AUTHOR", "EDITOR", "ADMIN"] as const;

interface Props { userId: string; name: string; roles: string[]; canPublishDirectly: boolean; isSelf: boolean }

/** READER is implicit and always kept. The server enforces every rule (last administrator, own admin role); this form only reports its answer. */
export function RoleEditor({ userId, name, roles, canPublishDirectly, isSelf }: Props) {
  const router = useRouter();
  const uid = useId();
  const [selected, setSelected] = useState(new Set(roles.filter((r) => r !== "READER")));
  const [grant, setGrant] = useState(canPublishDirectly);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}/role`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roles: ["READER", ...selected] }) });
      if (!res.ok) { setMsg({ ok: false, text: await errorMessage(res) }); return; }
      if (grant !== canPublishDirectly) {
        const g = await fetch(`/api/v1/admin/users/${userId}/author-grant`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ canPublishDirectly: grant }) });
        if (!g.ok) { setMsg({ ok: false, text: await errorMessage(g) }); router.refresh(); return; }
      }
      setMsg({ ok: true, text: "Saved." });
      router.refresh();
    } catch { setMsg({ ok: false, text: "Network error. Please try again." }); } finally { setBusy(false); }
  }

  const writer = selected.size > 0;
  return (
    <form onSubmit={save} className="role-editor" aria-label={`Roles for ${name}`}>
      {EDITABLE.map((r) => (
        <label key={r} htmlFor={`${uid}-${r}`} className="role-editor__opt">
          <input id={`${uid}-${r}`} type="checkbox" checked={selected.has(r)} disabled={isSelf && r === "ADMIN"}
            onChange={() => { setMsg(null); setSelected((p) => { const n = new Set(p); if (n.has(r)) n.delete(r); else n.add(r); return n; }); }} />
          {r.charAt(0) + r.slice(1).toLowerCase()}
        </label>
      ))}
      <label htmlFor={`${uid}-grant`} className="role-editor__opt" title="Lets this person publish their own articles without review">
        <input id={`${uid}-grant`} type="checkbox" checked={grant && writer} disabled={!writer} onChange={(e) => { setGrant(e.target.checked); setMsg(null); }} />
        Can publish directly
      </label>
      <button type="submit" className="btn btn--sm btn--secondary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      {msg ? <span role={msg.ok ? "status" : "alert"} className={msg.ok ? "muted" : "auth__field-error"}>{msg.text}</span> : null}
    </form>
  );
}
