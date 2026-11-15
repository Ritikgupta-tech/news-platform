"use client";
import { useId, useState } from "react";
import { errorMessage } from "@/components/admin/api";

export interface HeroImage { id: string; url: string; altText: string; caption: string | null; credit: string | null }
const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 5 * 1024 * 1024;

/** Uploads straight to the media API. The server re-checks the file's real type and size; these checks only save a round trip. */
export function HeroImageField({ value, onChange, disabled }: { value: HeroImage | null; onChange: (img: HeroImage | null) => void; disabled: boolean }) {
  const uid = useId();
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");
  const [credit, setCredit] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    if (!file) return;
    if (file.size > MAX_BYTES) { setError("Images can be at most 5 MB."); return; }
    if (alt.trim().length < 3) { setError("Describe the image for readers who cannot see it."); return; }
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file); fd.set("altText", alt); if (caption.trim()) fd.set("caption", caption); if (credit.trim()) fd.set("credit", credit);
      const res = await fetch("/api/v1/media", { method: "POST", body: fd });
      if (!res.ok) { setError(await errorMessage(res, "The upload failed. Check the file and try again.")); return; }
      const { data } = (await res.json()) as { data: { id: string; url: string; altText: string; caption: string | null; credit: string | null } };
      onChange({ id: data.id, url: data.url, altText: data.altText, caption: data.caption, credit: data.credit });
      setFile(null); setAlt(""); setCaption(""); setCredit("");
    } catch { setError("Network error. Please try again."); } finally { setBusy(false); }
  }

  return (
    <fieldset className="fieldset hero-field" disabled={disabled}>
      <legend>Main image</legend>
      {value ? (
        <div className="stack">
          <img src={value.url} alt={value.altText} className="hero-field__preview" />
          <p className="auth__hint">Alt text: {value.altText}{value.caption ? ` · Caption: ${value.caption}` : ""}{value.credit ? ` · Credit: ${value.credit}` : ""}</p>
          <button type="button" className="btn btn--sm btn--secondary" onClick={() => onChange(null)}>Remove image from article</button>
        </div>
      ) : (
        <div className="stack">
          <div className="auth__field"><label htmlFor={`${uid}-f`}>Image file (JPEG, PNG or WebP, up to 5 MB)</label><input id={`${uid}-f`} type="file" accept={ACCEPT} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }} /></div>
          <div className="auth__field"><label htmlFor={`${uid}-a`}>Alt text (required)</label><input id={`${uid}-a`} value={alt} maxLength={200} onChange={(e) => setAlt(e.target.value)} /></div>
          <div className="auth__field"><label htmlFor={`${uid}-c`}>Caption <span className="muted">(optional)</span></label><input id={`${uid}-c`} value={caption} maxLength={300} onChange={(e) => setCaption(e.target.value)} /></div>
          <div className="auth__field"><label htmlFor={`${uid}-p`}>Photographer credit <span className="muted">(optional)</span></label><input id={`${uid}-p`} value={credit} maxLength={120} onChange={(e) => setCredit(e.target.value)} /></div>
          <button type="button" className="btn btn--secondary btn--md" onClick={() => void upload()} disabled={busy || !file}>{busy ? "Uploading…" : "Upload image"}</button>
          {error ? <p className="auth__field-error" role="alert">{error}</p> : null}
        </div>
      )}
    </fieldset>
  );
}
