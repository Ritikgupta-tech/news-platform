"use client";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { HeroImageField, type HeroImage } from "./HeroImageField";
import { RichTextEditor } from "./RichTextEditor";

export interface EditorCategory { id: string; name: string }
export interface EditorArticle {
  id: string; version: number; status: string;
  title: string; subtitle: string; summary: string; bodyHtml: string; categoryId: string;
  tags: string[]; sourceName: string; sourceUrl: string; heroImage: HeroImage | null;
}

interface Props {
  categories: EditorCategory[];
  article?: EditorArticle;
  /** False when the article is locked for this person (e.g. in review): shown read-only. */
  canEdit: boolean;
  canSubmit: boolean;
}

interface Env { error?: { code?: string; message?: string; details?: unknown } }
type Fields = { title: string; subtitle: string; summary: string; bodyHtml: string; categoryId: string; tags: string; sourceName: string; sourceUrl: string };

const blank = (cat: string): Fields => ({ title: "", subtitle: "", summary: "", bodyHtml: "", categoryId: cat, tags: "", sourceName: "", sourceUrl: "" });

export function ArticleEditor({ categories, article, canEdit, canSubmit }: Props) {
  const router = useRouter();
  const uid = useId();
  const [f, setF] = useState<Fields>(() => article ? { title: article.title, subtitle: article.subtitle, summary: article.summary, bodyHtml: article.bodyHtml, categoryId: article.categoryId, tags: article.tags.join(", "), sourceName: article.sourceName, sourceUrl: article.sourceUrl } : blank(categories[0]?.id ?? ""));
  const [hero, setHero] = useState<HeroImage | null>(article?.heroImage ?? null);
  const [version, setVersion] = useState(article?.version ?? 0);
  const [id, setId] = useState(article?.id);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<null | "save" | "submit">(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [conflict, setConflict] = useState(false);
  const saved = useRef(false);

  // Pick up a newer server version (e.g. after a reviewer's action) only when the prop itself changes, and only if there
  // are no local edits. Re-applying a stale prop after our own save would cause false version conflicts.
  const seenPropVersion = useRef(article?.version);
  useEffect(() => {
    if (!article || article.version === seenPropVersion.current) return;
    seenPropVersion.current = article.version;
    if (!dirty) setVersion(article.version);
  }, [article, dirty]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty && !saved.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => { setF((p) => ({ ...p, [k]: v })); setDirty(true); setMessage(null); };

  function payload() {
    return {
      title: f.title.trim(), subtitle: f.subtitle.trim() || null, summary: f.summary.trim(), bodyHtml: f.bodyHtml,
      categoryId: f.categoryId, tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
      sourceName: f.sourceName.trim() || null, sourceUrl: f.sourceUrl.trim() || null, heroImageId: hero?.id ?? null,
    };
  }

  function localErrors(): Record<string, string> {
    const e: Record<string, string> = {};
    if (f.title.trim().length < 5) e["title"] = "Headline must be at least 5 characters";
    if (f.summary.trim().length < 10) e["summary"] = "Summary must be at least 10 characters";
    if (!f.bodyHtml) e["bodyHtml"] = "Write the article body";
    if (!f.categoryId) e["categoryId"] = "Choose a category";
    return e;
  }

  /** Saves; returns the new version (or null on failure). */
  async function save(): Promise<number | null> {
    const le = localErrors();
    setErrors(le);
    if (Object.keys(le).length) { setMessage({ kind: "error", text: "Please fix the highlighted fields." }); return null; }
    setBusy("save");
    try {
      const res = id
        ? await fetch(`/api/v1/articles/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload(), version }) })
        : await fetch("/api/v1/articles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()) });
      const body = (await res.json().catch(() => ({}))) as { data?: { id: string; version: number } } & Env;
      if (!res.ok) {
        if (body.error?.code === "VERSION_CONFLICT") { setConflict(true); setMessage({ kind: "error", text: "Someone else saved this article while you were editing." }); return null; }
        if (body.error?.code === "VALIDATION_ERROR" && Array.isArray(body.error.details)) {
          setErrors(Object.fromEntries((body.error.details as { path: string; message: string }[]).map((d) => [d.path, d.message])));
          setMessage({ kind: "error", text: "Please fix the highlighted fields." });
        } else setMessage({ kind: "error", text: body.error?.message ?? "Could not save. Please try again." });
        return null;
      }
      const data = body.data!;
      setVersion(data.version); setDirty(false); setErrors({});
      if (!id) { saved.current = true; setId(data.id); router.replace(`/author/articles/${data.id}/edit?created=1`); }
      else router.refresh();
      setMessage({ kind: "ok", text: "Saved." });
      return data.version;
    } catch {
      setMessage({ kind: "error", text: "Network error. Your text is still here; try again." });
      return null;
    } finally { setBusy(null); }
  }

  async function submitForReview() {
    const v = dirty || !id ? await save() : version;
    const articleId = id ?? undefined;
    if (v === null || !articleId) return;
    setBusy("submit");
    try {
      const res = await fetch(`/api/v1/articles/${articleId}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: v }) });
      const body = (await res.json().catch(() => ({}))) as Env;
      if (!res.ok) { setMessage({ kind: "error", text: body.error?.message ?? "Could not submit." }); return; }
      saved.current = true;
      router.push("/author/articles?submitted=1");
      router.refresh();
    } finally { setBusy(null); }
  }

  const err = (k: string) => errors[k];
  const fid = (k: string) => `${uid}-${k}`;

  return (
    <div className="editor">
      {conflict ? (
        <div className="notice notice--error" role="alert">
          <p><strong>Version conflict.</strong> Someone else saved a newer version. Reload to see it (your unsaved edits on this page will be lost), or copy your text first.</p>
          <Button size="sm" onClick={() => window.location.reload()}>Reload latest</Button>
        </div>
      ) : null}
      {message ? <p className={message.kind === "ok" ? "editor__saved" : "auth__error"} role={message.kind === "ok" ? "status" : "alert"}>{message.text}</p> : null}

      <div className="editor__grid">
        <div className="editor__main">
          <div className="auth__field">
            <label htmlFor={fid("title")}>Headline</label>
            <input id={fid("title")} value={f.title} disabled={!canEdit} maxLength={200} onChange={(e) => set("title", e.target.value)} aria-invalid={err("title") ? true : undefined} />
            {err("title") ? <p className="auth__field-error">{err("title")}</p> : null}
          </div>
          <div className="auth__field">
            <label htmlFor={fid("subtitle")}>Subheadline <span className="muted">(optional)</span></label>
            <input id={fid("subtitle")} value={f.subtitle} disabled={!canEdit} maxLength={300} onChange={(e) => set("subtitle", e.target.value)} />
          </div>
          <div className="auth__field">
            <label htmlFor={fid("summary")}>Summary</label>
            <textarea id={fid("summary")} rows={3} value={f.summary} disabled={!canEdit} maxLength={500} onChange={(e) => set("summary", e.target.value)} aria-invalid={err("summary") ? true : undefined} />
            <p className="auth__hint">{f.summary.length}/500, shown on cards and in search results.</p>
            {err("summary") ? <p className="auth__field-error">{err("summary")}</p> : null}
          </div>
          <div className="auth__field">
            <span id={fid("body-label")} className="editor__label">Article body</span>
            <RichTextEditor initialHtml={f.bodyHtml} onChange={(h) => set("bodyHtml", h)} readOnly={!canEdit} invalid={!!err("bodyHtml")} />
            {err("bodyHtml") ? <p className="auth__field-error">{err("bodyHtml")}</p> : null}
          </div>
        </div>

        <aside className="editor__side" aria-label="Article details">
          <HeroImageField value={hero} disabled={!canEdit} onChange={(img) => { setHero(img); setDirty(true); setMessage(null); }} />
          <div className="auth__field">
            <label htmlFor={fid("cat")}>Category</label>
            <select id={fid("cat")} value={f.categoryId} disabled={!canEdit} onChange={(e) => set("categoryId", e.target.value)}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {err("categoryId") ? <p className="auth__field-error">{err("categoryId")}</p> : null}
          </div>
          <div className="auth__field">
            <label htmlFor={fid("tags")}>Tags</label>
            <input id={fid("tags")} value={f.tags} disabled={!canEdit} onChange={(e) => set("tags", e.target.value)} aria-describedby={fid("tags-h")} />
            <p id={fid("tags-h")} className="auth__hint">Comma separated, up to 10.</p>
            {err("tags") ? <p className="auth__field-error">{err("tags")}</p> : null}
          </div>
          <div className="auth__field">
            <label htmlFor={fid("src")}>Source name <span className="muted">(if imported)</span></label>
            <input id={fid("src")} value={f.sourceName} disabled={!canEdit} onChange={(e) => set("sourceName", e.target.value)} />
          </div>
          <div className="auth__field">
            <label htmlFor={fid("url")}>Source URL</label>
            <input id={fid("url")} type="url" value={f.sourceUrl} disabled={!canEdit} onChange={(e) => set("sourceUrl", e.target.value)} aria-invalid={err("sourceUrl") ? true : undefined} />
            {err("sourceUrl") ? <p className="auth__field-error">{err("sourceUrl")}</p> : null}
          </div>
          {canEdit ? (
            <div className="editor__actions">
              <Button onClick={() => void save()} disabled={busy !== null || (!dirty && !!id)}>{busy === "save" ? "Saving…" : id ? "Save changes" : "Save draft"}</Button>
              {canSubmit ? <Button variant="secondary" onClick={() => void submitForReview()} disabled={busy !== null}>{busy === "submit" ? "Submitting…" : "Submit for review"}</Button> : null}
              <p className="auth__hint">{dirty ? "You have unsaved changes." : id ? `Version ${version}` : "Not saved yet."}</p>
            </div>
          ) : <p className="auth__hint">This article is locked for editing at its current stage.</p>}
        </aside>
      </div>
    </div>
  );
}
