import { slugify } from "./slug";

export interface TocItem { id: string; text: string; level: 2 | 3 }

const HEADING_RE = /<h([23])((?:\s[^>]*)?)>([\s\S]*?)<\/h\1>/gi;
const ID_RE = /\sid\s*=\s*("([^"]*)"|'([^']*)')/i;

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

/**
 * Adds unique `id` attributes to h2/h3 headings and returns a table of contents.
 * Input must already be sanitized HTML (sanitization happens on write in the editorial stage).
 * Ids are generated from heading text with slugify(), so they only contain [a-z0-9-].
 */
export function addHeadingIds(html: string): { html: string; items: TocItem[] } {
  const used = new Set<string>();
  const items: TocItem[] = [];
  const out = html.replace(HEADING_RE, (_m, lvl: string, attrs: string, inner: string) => {
    const text = stripTags(inner);
    if (!text) return _m;
    let id = slugify(text, 60);
    const existing = ID_RE.exec(attrs);
    const base = existing ? slugify(existing[2] ?? existing[3] ?? id, 60) : id;
    id = base;
    let n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    items.push({ id, text, level: Number(lvl) as 2 | 3 });
    const cleaned = attrs.replace(ID_RE, "");
    return `<h${lvl}${cleaned} id="${id}">${inner}</h${lvl}>`;
  });
  return { html: out, items };
}

/** Show a TOC only for long articles with enough structure. */
export function shouldShowToc(items: TocItem[], readingMinutes: number): boolean {
  return items.length >= 3 && readingMinutes >= 4;
}
