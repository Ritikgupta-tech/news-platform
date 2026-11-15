import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { ArticleImage } from "./ArticleImage";
import { formatRelative } from "@/lib/format";
import type { ArticleSummary } from "@/types/news";

/** Editor-selected stories (FeaturedStory table). Compact rows for the homepage sidebar. */
export function FeaturedStories({ items, now }: { items: ArticleSummary[]; now?: Date }) {
  return (
    <ul className="featured">
      {items.map((a) => (
        <li key={a.id} className="featured__item">
          <Link href={`/news/${a.slug}`} className="featured__thumb" tabIndex={-1} aria-hidden="true"><ArticleImage image={a.image} ratio="4 / 3" /></Link>
          <div className="featured__text">
            <Badge>{a.category.name}</Badge>
            <Link href={`/news/${a.slug}`} className="featured__title">{a.title}</Link>
            <time dateTime={a.publishedAt} className="featured__time">{formatRelative(a.publishedAt, now)}</time>
          </div>
        </li>
      ))}
    </ul>
  );
}
