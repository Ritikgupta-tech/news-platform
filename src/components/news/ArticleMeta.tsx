import { Icon } from "@/components/ui/Icon";
import { formatRelative } from "@/lib/format";
import type { ArticleSummary } from "@/types/news";

export function ArticleMeta({ article, now }: { article: Pick<ArticleSummary, "author" | "publishedAt" | "readingMinutes">; now?: Date }) {
  return (
    <p className="meta">
      <span>{article.author.name}</span>
      <span aria-hidden="true">·</span>
      <time dateTime={article.publishedAt}>{formatRelative(article.publishedAt, now)}</time>
      <span aria-hidden="true">·</span>
      <span className="meta__read"><Icon name="clock" size={14} />{article.readingMinutes} min read</span>
    </p>
  );
}
