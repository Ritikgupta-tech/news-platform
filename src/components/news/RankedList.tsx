import Link from "next/link";
import { ArticleImage } from "./ArticleImage";
import { compactNumber } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import type { RankedArticle } from "@/types/news";

/** Numbered luxury ranked list for Most Viewed / Trending Now. */
export function RankedList({
  items,
  label,
  showThumb = true,
}: {
  items: RankedArticle[];
  label: string;
  showThumb?: boolean;
}) {
  return (
    <ol className={`ranked ${showThumb ? "" : "ranked--no-thumb"}`} aria-label={label}>
      {items.map((a, i) => (
        <li key={a.id} className="ranked__item">
          <span className={`ranked__pos ${i === 0 ? "ranked__pos--top" : ""}`} aria-hidden="true">
            {String(i + 1).padStart(2, "0")}
          </span>

          {showThumb ? (
            <div className="ranked__thumb">
              <ArticleImage image={a.image} ratio="1 / 1" />
            </div>
          ) : null}

          <div className="ranked__text">
            <Link href={`/news/${a.slug}`} className="ranked__title">
              {a.title}
            </Link>
            <div className="ranked__meta">
              <span className="badge badge--neutral-pill">{a.category.name}</span>
              {typeof a.views === "number" ? (
                <span className="ranked__views">
                  <Icon name="trending" size={13} className="ranked__icon" />
                  {compactNumber(a.views)} readers
                </span>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
