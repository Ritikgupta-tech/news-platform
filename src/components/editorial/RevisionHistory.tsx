"use client";
import { useMemo, useState } from "react";
import { diffWords, stripTags } from "@/lib/diff";

export interface RevisionItem { version: number; title: string; summary: string; bodyHtml: string; changeNote: string | null; editedBy: { name: string }; createdAt: string }

export function RevisionHistory({ revisions }: { revisions: RevisionItem[] }) {
  const latest = revisions[0];
  const [selected, setSelected] = useState<number | null>(null);
  const rev = revisions.find((r) => r.version === selected);
  const parts = useMemo(() => (rev && latest ? diffWords(stripTags(rev.bodyHtml), stripTags(latest.bodyHtml)) : null), [rev, latest]);

  if (!revisions.length) return <p className="auth__hint">No revisions yet.</p>;
  return (
    <section className="panel" aria-label="Revision history">
      <h2 className="panel__title">Revision history</h2>
      <ol className="revisions">
        {revisions.map((r, i) => (
          <li key={r.version}>
            <div>
              <strong>Version {r.version}</strong>{i === 0 ? <span className="muted"> (current)</span> : null}
              <div className="muted revisions__meta">{r.editedBy.name} · <time dateTime={r.createdAt}>{new Date(r.createdAt).toISOString().slice(0, 16).replace("T", " ")} UTC</time>{r.changeNote ? ` · ${r.changeNote}` : ""}</div>
            </div>
            {i > 0 ? <button type="button" className="btn btn--ghost btn--sm" aria-pressed={selected === r.version} onClick={() => setSelected(selected === r.version ? null : r.version)}>{selected === r.version ? "Hide changes" : "Compare with current"}</button> : null}
          </li>
        ))}
      </ol>
      {rev && latest ? (
        <div className="diff" aria-label={`Changes from version ${rev.version} to the current version`}>
          {rev.title !== latest.title ? <p><span className="diff__del">{rev.title}</span> → <span className="diff__add">{latest.title}</span></p> : null}
          {parts ? <p>{parts.map((p, i) => p.type === "same" ? <span key={i}>{p.text}</span> : p.type === "add" ? <ins key={i} className="diff__add">{p.text}</ins> : <del key={i} className="diff__del">{p.text}</del>)}</p> : <p className="muted">These versions are too long to compare here.</p>}
        </div>
      ) : null}
    </section>
  );
}
