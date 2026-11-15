import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/format";
import type { ArticleListItemDto } from "@/server/articles/service";

export function ReaderArticleRow({ article, note, children }: { article: ArticleListItemDto; note?: ReactNode; children?: ReactNode }) {
  return (
    <li className="reader-row">
      <div className="reader-row__main">
        <div><Badge>{article.category.name}</Badge></div>
        <Link className="reader-row__title" href={`/news/${article.slug}`}>{article.title}</Link>
        <p className="meta">
          <span>{article.author.name}</span><span aria-hidden="true">·</span>
          <time dateTime={article.publishedAt ?? undefined}>{article.publishedAt ? formatDate(article.publishedAt) : ""}</time><span aria-hidden="true">·</span>
          <span>{article.readingMinutes} min read</span>
          {note ? <><span aria-hidden="true">·</span><span>{note}</span></> : null}
        </p>
      </div>
      {children}
    </li>
  );
}
