"use client";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";

interface Props {
  categories: { id: string; name: string }[];
  initial: { interests: string[]; editorialNotifications: boolean; recordReadingHistory: boolean };
  maxInterests: number;
  canReceiveEditorial: boolean;
}

export function PreferencesForm({ categories, initial, maxInterests, canReceiveEditorial }: Props) {
  const router = useRouter();
  const uid = useId();
  const [interests, setInterests] = useState(new Set(initial.interests));
  const [editorial, setEditorial] = useState(initial.editorialNotifications);
  const [history, setHistory] = useState(initial.recordReadingHistory);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const toggle = (id: string) => {
    setMsg(null);
    setInterests((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < maxInterests) next.add(id);
      return next;
    });
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/v1/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interests: [...interests], editorialNotifications: editorial, recordReadingHistory: history }) });
      if (!res.ok) { setMsg({ ok: false, text: "Couldn’t save your preferences. Please try again." }); return; }
      setMsg({ ok: true, text: "Preferences saved." });
      router.refresh();
    } catch { setMsg({ ok: false, text: "Network error. Please try again." }); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="stack">
      <fieldset className="fieldset">
        <legend>Topics you follow</legend>
        <p className="auth__hint">Pick up to {maxInterests}. {interests.size} selected.</p>
        <div className="checkbox-grid">
          {categories.map((c) => {
            const id = `${uid}-${c.id}`;
            const checked = interests.has(c.id);
            return (
              <label key={c.id} htmlFor={id} className={`checkbox-chip${checked ? " is-checked" : ""}`}>
                <input id={id} type="checkbox" checked={checked} onChange={() => toggle(c.id)} disabled={!checked && interests.size >= maxInterests} />
                {c.name}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="fieldset">
        <legend>Privacy and notifications</legend>
        <label className="switch-row">
          <input type="checkbox" checked={history} onChange={(e) => { setHistory(e.target.checked); setMsg(null); }} />
          <span><strong>Keep a reading history</strong><span className="muted"> Private to you. Turning this off stops new entries; clear existing ones from your history page.</span></span>
        </label>
        {canReceiveEditorial ? (
          <label className="switch-row">
            <input type="checkbox" checked={editorial} onChange={(e) => { setEditorial(e.target.checked); setMsg(null); }} />
            <span><strong>Newsroom notifications</strong><span className="muted"> Submissions, reviews and publishing updates. Security alerts are always sent.</span></span>
          </label>
        ) : null}
      </fieldset>

      {msg ? <p className={msg.ok ? "editor__saved" : "auth__error"} role={msg.ok ? "status" : "alert"}>{msg.text}</p> : null}
      <div><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save preferences"}</Button></div>
    </form>
  );
}
