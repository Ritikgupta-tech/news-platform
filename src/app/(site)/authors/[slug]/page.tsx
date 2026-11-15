import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleRow } from "@/components/news/ArticleCard";
import { Pagination } from "@/components/news/Pagination";
import { StateMessage } from "@/components/ui/StateMessage";
import { getContent } from "@/lib/content";
import { parsePage } from "@/lib/search";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string | string[] }> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const a = await getContent().getAuthor((await params).slug);
  if (!a) return { title: "Author not found", robots: { index: false } };
  return { title: a.name, description: a.bio ?? `Articles by ${a.name}.`, alternates: { canonical: `/authors/${a.slug}` } };
}

export default async function AuthorPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const page = parsePage((await searchParams).page);
  const repo = getContent();
  const author = await repo.getAuthor(slug);
  if (!author) notFound();
  const { items, meta } = await repo.listLatest({ page, pageSize: 10, authorSlug: author.slug });
  return (
    <section aria-labelledby="h">
      <header className="author-head">
        <span className="avatar avatar--lg" aria-hidden="true">{author.name.slice(0, 1).toUpperCase()}</span>
        <div><h1 id="h">{author.name}</h1>{author.bio ? <p className="muted">{author.bio}</p> : null}</div>
      </header>
      {items.length === 0 ? <StateMessage kind="empty" title="No published stories yet">This author hasn&rsquo;t published anything yet.</StateMessage> : <div className="feed">{items.map((a) => <ArticleRow key={a.id} article={a} />)}</div>}
      <Pagination basePath={`/authors/${author.slug}`} page={meta.page} totalPages={meta.totalPages} />
    </section>
  );
}
