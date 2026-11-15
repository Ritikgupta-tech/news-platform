import { BookmarkButton } from "@/components/reader/BookmarkButton";
import { ReadTracker } from "@/components/reader/ReadTracker";
import { CommentSection } from "@/components/article/CommentSection";
import { ViewTracker } from "@/components/reader/ViewTracker";
import { getAuthContext } from "@/server/auth/current-user";
import { getDeps } from "@/server/container";
import { isBookmarked } from "@/server/reader/bookmarks";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleCard } from "@/components/news/ArticleCard";
import { ArticleImage } from "@/components/news/ArticleImage";
import { Breadcrumbs } from "@/components/article/Breadcrumbs";
import { ReadingProgress } from "@/components/article/ReadingProgress";
import { ShareButtons } from "@/components/article/ShareButtons";
import { ReportArticleButton } from "@/components/article/ReportArticleButton";
import { TableOfContents } from "@/components/article/TableOfContents";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { getContent } from "@/lib/content";
import { formatDate } from "@/lib/format";
import { absoluteUrl, breadcrumbJsonLd, jsonLdString, newsArticleJsonLd } from "@/lib/seo";
import { SITE_NAME, siteUrl } from "@/lib/site";
import { addHeadingIds, shouldShowToc } from "@/lib/toc";
import { settle } from "@/lib/safe";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const a = await getContent().getArticle(slug);
  if (!a) return { title: "Article not found", robots: { index: false } };
  const url = absoluteUrl(`/news/${a.slug}`, siteUrl());
  return {
    title: a.title,
    description: a.summary,
    alternates: { canonical: url },
    openGraph: { type: "article", url, title: a.title, description: a.summary, siteName: SITE_NAME, publishedTime: a.publishedAt, modifiedTime: a.updatedAt, authors: [a.author.name], section: a.category.name, images: a.image ? [{ url: a.image.url, alt: a.image.alt }] : undefined },
    twitter: { card: "summary_large_image", title: a.title, description: a.summary },
  };
}

async function readerState(articleId: string): Promise<{ reader: { id: string; roles: readonly string[] } | null; saved: boolean }> {
  try {
    const reader = await getAuthContext();
    if (!reader) return { reader: null, saved: false };
    return { reader, saved: await isBookmarked(getDeps(), reader.id, articleId) };
  } catch {
    return { reader: null, saved: false }; // personalisation must never break reading
  }
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const repo = getContent();
  const article = await repo.getArticle(slug);
  if (!article) notFound();

  const [related, adjacent] = await Promise.all([
    settle("related", repo.listRelated(slug, 3), []),
    settle("adjacent", repo.getAdjacent(slug), { previous: null, next: null }),
  ]);
  const { reader, saved } = await readerState(article.id);
  const { html, items: toc } = addHeadingIds(article.bodyHtml);
  const showToc = shouldShowToc(toc, article.readingMinutes);
  const base = siteUrl();
  const url = absoluteUrl(`/news/${article.slug}`, base);
  const updatedLater = new Date(article.updatedAt).getTime() - new Date(article.publishedAt).getTime() > 3_600_000;

  return (
    <>
      <ReadingProgress targetId="article-body" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(newsArticleJsonLd(article, base, SITE_NAME)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: article.category.name, path: `/category/${article.category.slug}` }, { name: article.title, path: `/news/${article.slug}` }], base)) }} />

      <article className={`article ${showToc ? "article--toc" : ""}`} aria-labelledby="article-title">
        <header className="article__head">
          <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: article.category.name, href: `/category/${article.category.slug}` }, { name: article.title }]} />
          <div className="hero__badges">{article.isBreaking ? <Badge tone="breaking">Breaking News</Badge> : null}<Badge>{article.category.name}</Badge></div>
          <h1 id="article-title" className="article__title">{article.title}</h1>
          {article.subtitle ? <p className="article__subtitle">{article.subtitle}</p> : null}
          <p className="meta article__byline">
            <span>By {article.author.slug ? <Link href={`/authors/${article.author.slug}`}>{article.author.name}</Link> : article.author.name}</span><span aria-hidden="true">·</span>
            <time dateTime={article.publishedAt}>{formatDate(article.publishedAt)}</time>
            {updatedLater ? <><span aria-hidden="true">·</span><span>Updated <time dateTime={article.updatedAt}>{formatDate(article.updatedAt)}</time></span></> : null}
            <span aria-hidden="true">·</span><span className="meta__read"><Icon name="clock" size={14} />{article.readingMinutes} min read</span>
          </p>
        </header>

        {article.image ? (
          <figure className="article__figure">
            <ArticleImage image={article.image} ratio="16 / 9" eager sizes="(min-width: 1024px) 900px, 100vw" />
            {article.imageCaption || article.imageCredit ? <figcaption>{article.imageCaption}{article.imageCaption && article.imageCredit ? " " : ""}{article.imageCredit ? <span className="credit">Photo: {article.imageCredit}</span> : null}</figcaption> : null}
          </figure>
        ) : null}

        <div className="article__layout">
          <div id="article-body" className="article__main">
            <div className="article__tools">
              <ShareButtons url={url} title={article.title} />
              <BookmarkButton articleId={article.id} initial={saved} signedIn={!!reader} loginHref={`/login?next=${encodeURIComponent(`/news/${article.slug}`)}`} />
              <ReportArticleButton articleId={article.id} articleTitle={article.title} />
            </div>
            <ViewTracker articleId={article.id} />
            {reader ? <ReadTracker articleId={article.id} /> : null}
            {/* bodyHtml is sanitized server-side when saved (editorial stage); never render unsanitized HTML here. */}
            <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
            {article.source ? <p className="muted source">Source: <a href={article.source.url} rel="noopener noreferrer nofollow" target="_blank">{article.source.name}</a></p> : null}
            {article.tags.length ? <ul className="chips" aria-label="Tags">{article.tags.map((t) => <li key={t.slug}><span className="chip">{t.name}</span></li>)}</ul> : null}

            <aside className="author-box" aria-label="About the author">
              <span className="avatar avatar--lg" aria-hidden="true">{article.author.name.slice(0, 1).toUpperCase()}</span>
              <div>
                <p className="author-box__name">{article.author.slug ? <Link href={`/authors/${article.author.slug}`}>{article.author.name}</Link> : article.author.name}</p>
                {article.author.bio ? <p className="muted">{article.author.bio}</p> : null}
              </div>
            </aside>
          </div>
          {showToc ? <aside className="article__aside"><TableOfContents items={toc} /></aside> : null}
        </div>
      </article>

      <CommentSection articleId={article.id} slug={article.slug} viewer={reader} />

      <nav className="prev-next" aria-label="More articles">
        {adjacent.data.previous ? <Link href={`/news/${adjacent.data.previous.slug}`} rel="prev"><small>Previous</small><span>{adjacent.data.previous.title}</span></Link> : <span />}
        {adjacent.data.next ? <Link href={`/news/${adjacent.data.next.slug}`} rel="next" className="prev-next__next"><small>Next</small><span>{adjacent.data.next.title}</span></Link> : <span />}
      </nav>

      {related.data.length ? (
        <section aria-labelledby="rel">
          <div className="section-heading"><h2 id="rel">Related stories</h2></div>
          <div className="card-grid card-grid--3">{related.data.map((a) => <ArticleCard key={a.id} article={a} />)}</div>
        </section>
      ) : null}
    </>
  );
}
