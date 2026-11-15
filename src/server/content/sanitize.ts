import sanitizeHtml from "sanitize-html";

/** Allow-list for editorial HTML. Everything else (scripts, iframes, styles, event handlers, javascript: URLs) is removed. */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h2", "h3", "h4", "p", "br", "hr", "strong", "b", "em", "i", "u", "s", "code", "pre", "blockquote",
    "ul", "ol", "li", "a", "figure", "figcaption", "img", "table", "thead", "tbody", "tr", "th", "td",
  ],
  allowedAttributes: {
    a: ["href", "title", "rel", "target"],
    img: ["src", "alt", "width", "height", "loading"],
    th: ["scope"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["https"] },
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  // Editors leave stray empty paragraphs behind; drop them (but keep a paragraph that only holds an image).
  exclusiveFilter: (frame) => frame.tag === "p" && !frame.text.trim() && frame.mediaChildren.length === 0,
  transformTags: {
    h1: "h2", // the page title is the only h1
    a: (tagName, attribs) => {
      const out: Record<string, string> = { ...attribs, rel: "noopener noreferrer nofollow" };
      if (out["target"] && out["target"] !== "_blank") delete out["target"];
      return { tagName, attribs: out };
    },
    img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, loading: "lazy", alt: attribs["alt"] ?? "" } }),
  },
};

export function sanitizeArticleHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS).trim();
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

/** Plain text of (already sanitized) HTML, used for search indexing and reading-time. */
export function htmlToText(html: string): string {
  const spaced = html.replace(/<\/(p|h[1-6]|li|blockquote|tr|figcaption|pre)>|<br\s*\/?>/gi, " ");
  const stripped = sanitizeHtml(spaced, { allowedTags: [], allowedAttributes: {} });
  return stripped.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m).replace(/\s+/g, " ").trim();
}
