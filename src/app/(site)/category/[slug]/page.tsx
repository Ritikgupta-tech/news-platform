import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleRow } from "@/components/news/ArticleCard";
import { Pagination } from "@/components/news/Pagination";
import { StateMessage } from "@/components/ui/StateMessage";
import { Breadcrumbs } from "@/components/article/Breadcrumbs";
import { getContent } from "@/lib/content";
import { parsePage } from "@/lib/search";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string | string[] }> };

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const cat = await getContent().getCategory((await params).slug);
  if (!cat) return { title: "Category not found", robots: { index: false } };
  return { title: `${cat.name} news`, description: `Latest ${cat.name} stories from E News.`, alternates: { canonical: `/category/${cat.slug}` } };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const page = parsePage((await searchParams).page);
  const repo = getContent();
  const cat = await repo.getCategory(slug);
  if (!cat) notFound();
  const { items, meta } = await repo.listLatest({ page, pageSize: 10, categorySlug: cat.slug });
  return (
    <section aria-labelledby="h">
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: cat.name }]} />
      <div className="page-head"><h1 id="h">{cat.name}</h1></div>
      {items.length === 0 ? (
        <StateMessage kind="empty" title={`No ${cat.name} stories yet`}>{page > 1 ? "That page doesn’t exist." : "Nothing has been published in this category."}</StateMessage>
      ) : (
        <div className="feed">{items.map((a) => <ArticleRow key={a.id} article={a} />)}</div>
      )}
      <Pagination basePath={`/category/${cat.slug}`} page={meta.page} totalPages={meta.totalPages} />
    </section>
  );
}
