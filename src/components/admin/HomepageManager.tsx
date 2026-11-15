"use client";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { PromoBanner, type PromoConfig } from "@/components/news/PromoBanner";
import { errorMessage } from "./api";

export interface PinRow { id: string; title: string; live: boolean }
interface Props {
  slots: { HERO: PinRow[]; FEATURED: PinRow[] };
  candidates: PinRow[];
  limits: { HERO: number; FEATURED: number };
  promo: PromoConfig | null;
  canManagePromo: boolean;
}

type Msg = { ok: boolean; text: string } | null;
const Note = ({ m }: { m: Msg }) => (m ? <p role={m.ok ? "status" : "alert"} className={m.ok ? "muted" : "auth__field-error"}>{m.text}</p> : null);

function SlotEditor({ slot, title, help, initial, pool, limit }: { slot: "HERO" | "FEATURED"; title: string; help: string; initial: PinRow[]; pool: PinRow[]; limit: number }) {
  const router = useRouter();
  const uid = useId();
  const [items, setItems] = useState(initial);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const dirty = items.map((i) => i.id).join() !== initial.map((i) => i.id).join();
  const available = pool.filter((c) => !items.some((i) => i.id === c.id));

  const move = (i: number, d: -1 | 1) => { setMsg(null); setItems((p) => { const n = [...p]; const j = i + d; if (j < 0 || j >= n.length) return p; [n[i], n[j]] = [n[j]!, n[i]!]; return n; }); };
  const add = () => { const c = pool.find((x) => x.id === pick); if (c && items.length < limit) { setItems([...items, c]); setPick(""); setMsg(null); } };

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(`/api/v1/admin/homepage/slots/${slot.toLowerCase()}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ articleIds: items.map((i) => i.id) }) });
      if (!res.ok) { setMsg({ ok: false, text: await errorMessage(res) }); return; }
      setMsg({ ok: true, text: "Published to the homepage." });
      router.refresh();
    } catch { setMsg({ ok: false, text: "Network error. Please try again." }); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="fieldset" aria-labelledby={`${uid}-t`}>
      <h2 id={`${uid}-t`}>{title}</h2>
      <p className="muted">{help} Up to {limit}. The order below is the order readers see; nothing changes until you save.</p>
      {items.length ? (
        <ol className="pin-list">
          {items.map((it, i) => (
            <li key={it.id}>
              <span className="pin-list__title">{it.title}{it.live ? "" : " (not live: will be skipped)"}</span>
              <span className="action-wrap">
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${it.title} up`}>Up</button>
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`Move ${it.title} down`}>Down</button>
                <button type="button" className="btn btn--sm btn--ghost btn--danger" onClick={() => { setItems(items.filter((x) => x.id !== it.id)); setMsg(null); }} aria-label={`Remove ${it.title}`}>Remove</button>
              </span>
            </li>
          ))}
        </ol>
      ) : <p className="muted">{slot === "HERO" ? "Empty: the homepage falls back to the newest stories that have an image." : "Empty: the Featured Stories box is hidden."}</p>}
      {items.length < limit ? (
        <div className="inline-form">
          <div className="auth__field"><label htmlFor={`${uid}-p`}>Add a published story</label>
            <select id={`${uid}-p`} value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Choose…</option>{available.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
          </div>
          <button type="button" className="btn btn--secondary btn--md" onClick={add} disabled={!pick}>Add</button>
        </div>
      ) : null}
      <div className="action-wrap"><button type="submit" className="btn btn--primary btn--md" disabled={busy || !dirty}>{busy ? "Saving…" : "Save changes"}</button>{dirty ? <span className="muted">Unsaved changes</span> : null}</div>
      <Note m={msg} />
    </form>
  );
}

function PromoEditor({ initial }: { initial: PromoConfig | null }) {
  const router = useRouter();
  const uid = useId();
  const [v, setV] = useState({ eyebrow: initial?.eyebrow ?? "", title: initial?.title ?? "", body: initial?.body ?? "", ctaLabel: initial?.ctaLabel ?? "", ctaHref: initial?.ctaHref ?? "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => { setV({ ...v, [k]: e.target.value }); setMsg(null); };
  const previewable = v.title.trim().length >= 3 && v.ctaLabel.trim().length >= 2 && v.ctaHref.trim().length > 0;

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const body = { title: v.title, ctaLabel: v.ctaLabel, ctaHref: v.ctaHref, ...(v.eyebrow.trim() ? { eyebrow: v.eyebrow } : {}), ...(v.body.trim() ? { body: v.body } : {}) };
      const res = await fetch("/api/v1/admin/homepage/promo", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { setMsg({ ok: false, text: await errorMessage(res) }); return; }
      setMsg({ ok: true, text: "Banner saved." }); router.refresh();
    } catch { setMsg({ ok: false, text: "Network error. Please try again." }); } finally { setBusy(false); }
  }
  async function clear() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/v1/admin/homepage/promo", { method: "DELETE" });
      if (!res.ok) { setMsg({ ok: false, text: await errorMessage(res) }); return; }
      setV({ eyebrow: "", title: "", body: "", ctaLabel: "", ctaHref: "" }); setMsg({ ok: true, text: "Banner removed from the homepage." }); router.refresh();
    } catch { setMsg({ ok: false, text: "Network error. Please try again." }); } finally { setBusy(false); }
  }

  const field = (k: keyof typeof v, label: string, extra: { required?: boolean; max: number; multiline?: boolean }) => (
    <div className="auth__field"><label htmlFor={`${uid}-${k}`}>{label}</label>
      {extra.multiline ? <textarea id={`${uid}-${k}`} value={v[k]} onChange={set(k)} maxLength={extra.max} rows={2} /> : <input id={`${uid}-${k}`} value={v[k]} onChange={set(k)} maxLength={extra.max} required={extra.required} />}
    </div>
  );
  return (
    <form onSubmit={save} className="fieldset" aria-labelledby={`${uid}-t`}>
      <h2 id={`${uid}-t`}>Promotional banner</h2>
      <p className="muted">Shown at the bottom of the homepage. The link must be a site path such as /newsletter, or start with https://.</p>
      {field("eyebrow", "Small label (optional)", { max: 40 })}
      {field("title", "Headline", { required: true, max: 120 })}
      {field("body", "Text (optional)", { max: 240, multiline: true })}
      {field("ctaLabel", "Button label", { required: true, max: 40 })}
      {field("ctaHref", "Button link", { required: true, max: 500 })}
      <div><p className="muted">Preview</p>{previewable ? <PromoBanner promo={{ title: v.title, ctaLabel: v.ctaLabel, ctaHref: v.ctaHref, ...(v.eyebrow ? { eyebrow: v.eyebrow } : {}), ...(v.body ? { body: v.body } : {}) }} /> : <p className="muted">Fill in the headline, button label and link to see it.</p>}</div>
      <div className="action-wrap">
        <button type="submit" className="btn btn--primary btn--md" disabled={busy}>{busy ? "Saving…" : "Save banner"}</button>
        {initial ? <button type="button" className="btn btn--secondary btn--md btn--danger" onClick={clear} disabled={busy}>Remove banner</button> : null}
      </div>
      <Note m={msg} />
    </form>
  );
}

export function HomepageManager({ slots, candidates, limits, promo, canManagePromo }: Props) {
  // Stories already in one slot can still be moved into the other, so each editor's pool includes the other slot's stories.
  return (
    <div className="stack">
      <SlotEditor key={`H${slots.HERO.map((i) => i.id).join()}`} slot="HERO" title="Top story carousel" help="Large stories at the top of the homepage." initial={slots.HERO} pool={[...candidates, ...slots.FEATURED]} limit={limits.HERO} />
      <SlotEditor key={`F${slots.FEATURED.map((i) => i.id).join()}`} slot="FEATURED" title="Featured stories" help="The short list beside the carousel." initial={slots.FEATURED} pool={[...candidates, ...slots.HERO]} limit={limits.FEATURED} />
      {canManagePromo ? <PromoEditor initial={promo} /> : null}
    </div>
  );
}
