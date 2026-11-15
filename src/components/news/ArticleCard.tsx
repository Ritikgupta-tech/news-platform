import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { ArticleImage } from "./ArticleImage";
import { ArticleMeta } from "./ArticleMeta";
import type { ArticleSummary } from "@/types/news";

/** Vertical card, used for Featured Stories grids. */
export function ArticleCard({ article, now }: { article: ArticleSummary; now?: Date }) {
  return (
    <article className="card card--article">
      <Link href={`/news/${article.slug}`} className="card__media" tabIndex={-1} aria-hidden="true">
        <ArticleImage image={article.image} ratio="3 / 2" />
      </Link>
      <div className="card__body">
        <Badge>{article.category.name}</Badge>
        <h3 className="card__title"><Link href={`/news/${article.slug}`}>{article.title}</Link></h3>
        <ArticleMeta article={article} now={now} />
      </div>
    </article>
  );
}

/** Horizontal row, used for the Latest News feed. Stacks on mobile. */
export function ArticleRow({ article, now }: { article: ArticleSummary; now?: Date }) {
  return (
    <article className="row-card">
      <Link href={`/news/${article.slug}`} className="row-card__media" tabIndex={-1} aria-hidden="true">
        <ArticleImage image={article.image} ratio="3 / 2" />
      </Link>
      <div className="row-card__body">
        <Badge>{article.category.name}</Badge>
        <h3 className="row-card__title"><Link href={`/news/${article.slug}`}>{article.title}</Link></h3>
        <p className="row-card__summary">{article.summary}</p>
        <ArticleMeta article={article} now={now} />
      </div>
    </article>
  );
}
