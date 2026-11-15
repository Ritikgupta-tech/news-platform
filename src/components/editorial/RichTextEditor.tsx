"use client";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useId, useState } from "react";

interface Props {
  initialHtml: string;
  onChange: (html: string) => void;
  readOnly?: boolean;
  label?: string;
  invalid?: boolean;
}

function ToolbarButton({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className="rte__btn" aria-label={label} title={label} aria-pressed={active ?? false} disabled={disabled} onClick={onClick}
      onMouseDown={(e) => e.preventDefault() /* keep the caret and focus in the editor so typing is never lost */}>
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState("https://");
  const [linkError, setLinkError] = useState<string | null>(null);
  const id = useId();
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"), italic: e.isActive("italic"), underline: e.isActive("underline"), strike: e.isActive("strike"),
      h2: e.isActive("heading", { level: 2 }), h3: e.isActive("heading", { level: 3 }),
      ul: e.isActive("bulletList"), ol: e.isActive("orderedList"), quote: e.isActive("blockquote"), link: e.isActive("link"),
      canUndo: e.can().undo(), canRedo: e.can().redo(),
    }),
  });
  const c = () => editor.chain().focus();

  function applyLink() {
    let href = url.trim();
    if (!/^(https?:\/\/|mailto:)/i.test(href)) { setLinkError("Enter a full link starting with https:// or mailto:"); return; }
    try { if (!href.startsWith("mailto:")) new URL(href); } catch { setLinkError("That doesn't look like a valid link"); return; }
    c().extendMarkRange("link").setLink({ href }).run();
    setLinkOpen(false); setLinkError(null);
  }

  return (
    <div className="rte__toolbar" role="toolbar" aria-label="Text formatting">
      <ToolbarButton label="Bold" active={s.bold} onClick={() => c().toggleBold().run()}><b>B</b></ToolbarButton>
      <ToolbarButton label="Italic" active={s.italic} onClick={() => c().toggleItalic().run()}><i>I</i></ToolbarButton>
      <ToolbarButton label="Underline" active={s.underline} onClick={() => c().toggleUnderline().run()}><u>U</u></ToolbarButton>
      <ToolbarButton label="Strikethrough" active={s.strike} onClick={() => c().toggleStrike().run()}><s>S</s></ToolbarButton>
      <span className="rte__sep" aria-hidden="true" />
      <ToolbarButton label="Heading" active={s.h2} onClick={() => c().toggleHeading({ level: 2 }).run()}>H2</ToolbarButton>
      <ToolbarButton label="Subheading" active={s.h3} onClick={() => c().toggleHeading({ level: 3 }).run()}>H3</ToolbarButton>
      <ToolbarButton label="Bulleted list" active={s.ul} onClick={() => c().toggleBulletList().run()}>• List</ToolbarButton>
      <ToolbarButton label="Numbered list" active={s.ol} onClick={() => c().toggleOrderedList().run()}>1. List</ToolbarButton>
      <ToolbarButton label="Quote" active={s.quote} onClick={() => c().toggleBlockquote().run()}>“ ”</ToolbarButton>
      <span className="rte__sep" aria-hidden="true" />
      <ToolbarButton label={s.link ? "Remove link" : "Add link"} active={s.link} onClick={() => (s.link ? c().unsetLink().run() : setLinkOpen((o) => !o))}>Link</ToolbarButton>
      <ToolbarButton label="Undo" disabled={!s.canUndo} onClick={() => c().undo().run()}>↶</ToolbarButton>
      <ToolbarButton label="Redo" disabled={!s.canRedo} onClick={() => c().redo().run()}>↷</ToolbarButton>
      {linkOpen ? (
        <div className="rte__link">
          <label htmlFor={`${id}-url`} className="visually-hidden">Link address</label>
          <input id={`${id}-url`} value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } if (e.key === "Escape") setLinkOpen(false); }} autoFocus />
          <button type="button" className="btn btn--primary btn--sm" onClick={applyLink}>Apply</button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setLinkOpen(false)}>Cancel</button>
          {linkError ? <p className="auth__field-error" role="alert">{linkError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function RichTextEditor({ initialHtml, onChange, readOnly = false, label = "Article body", invalid = false }: Props) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer nofollow" } } })],
    content: initialHtml,
    editable: !readOnly,
    immediatelyRender: false, // avoids a server/client markup mismatch under Next.js
    editorProps: { attributes: { role: "textbox", "aria-multiline": "true", "aria-label": label, ...(invalid ? { "aria-invalid": "true" } : {}), class: "rte__content article-body" } },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? "" : e.getHTML()),
  });

  useEffect(() => { editor?.setEditable(!readOnly, false); /* false: do not report this as a content change */ }, [editor, readOnly]);

  return (
    <div className={`rte${readOnly ? " rte--readonly" : ""}${invalid ? " rte--invalid" : ""}`}>
      {editor && !readOnly ? <Toolbar editor={editor} /> : null}
      <EditorContent editor={editor} />
    </div>
  );
}
