import type { Metadata } from "next";
import { ArticleRow } from "@/components/news/ArticleCard";
import { Pagination } from "@/components/news/Pagination";
import { StateMessage } from "@/components/ui/StateMessage";
import { getContent } from "@/lib/content";
import { parsePage } from "@/lib/search";

export const metadata: Metadata = { title: "Latest news", description: "The latest stories from the E News newsroom.", alternates: { canonical: "/news" } };

export default async function NewsIndex({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const page = parsePage((await searchParams).page);
  const { items, meta } = await getContent().listLatest({ page, pageSize: 10 });
  return (
    <section aria-labelledby="h">
      <div className="page-head"><h1 id="h">Latest news</h1></div>
      {items.length === 0 ? (
        <StateMessage kind="empty" title="No stories found">{page > 1 ? "That page doesn’t exist." : "Nothing has been published yet."}</StateMessage>
      ) : (
        <div className="feed">{items.map((a) => <ArticleRow key={a.id} article={a} />)}</div>
      )}
      <Pagination basePath="/news" page={meta.page} totalPages={meta.totalPages} />
    </section>
  );
}
