import type { TocItem } from "@/lib/toc";

export function TableOfContents({ items }: { items: TocItem[] }) {
  return (
    <nav className="toc" aria-label="Table of contents">
      <h2 className="toc__title">In this article</h2>
      <ol>{items.map((i) => <li key={i.id} className={i.level === 3 ? "toc__sub" : ""}><a href={`#${i.id}`}>{i.text}</a></li>)}</ol>
    </nav>
  );
}
