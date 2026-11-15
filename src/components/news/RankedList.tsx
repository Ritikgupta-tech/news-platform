import Link from "next/link";
import { ArticleImage } from "./ArticleImage";
import { compactNumber } from "@/lib/format";
import type { RankedArticle } from "@/types/news";

/** Numbered list for Most Viewed / Trending Now. The view metric renders only when real data is supplied. */
export function RankedList({ items, label, showThumb = true }: { items: RankedArticle[]; label: string; showThumb?: boolean }) {
  return (
    <ol className={`ranked ${showThumb ? "" : "ranked--no-thumb"}`} aria-label={label}>
      {items.map((a, i) => (
        <li key={a.id} className="ranked__item">
          <span className="ranked__pos" aria-hidden="true">{i + 1}</span>
          {showThumb ? <div className="ranked__thumb"><ArticleImage image={a.image} ratio="1 / 1" /></div> : null}
          <div className="ranked__text">
            <Link href={`/news/${a.slug}`} className="ranked__title">{a.title}</Link>
            <span className="ranked__sub">
              {a.category.name}
              {typeof a.views === "number" ? <> · {compactNumber(a.views)} views</> : null}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
