import type { Metadata } from "next";
import { ArticleRow } from "@/components/news/ArticleCard";
import { Pagination } from "@/components/news/Pagination";
import { StateMessage } from "@/components/ui/StateMessage";
import { Icon } from "@/components/ui/Icon";
import { getContent } from "@/lib/content";
import Link from "next/link";
import { SEARCH_MAX, SEARCH_MIN, SEARCH_PAGE_SIZE, parseSearchParams, parseSort } from "@/lib/search";
import { settle } from "@/lib/safe";

// Search result pages must not be indexed (thin, infinite URL space).
export const metadata: Metadata = { title: "Search", robots: { index: false, follow: true } };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; page?: string | string[]; sort?: string | string[] }> }) {
  const sp = await searchParams;
  const parsed = parseSearchParams(sp);
  const sort = parseSort(sp.sort);
  const repo = getContent();
  const [cats] = await Promise.all([settle("categories", repo.listCategories(), [])]);
  const result = parsed.ok ? await settle("search", repo.search({ q: parsed.q, page: parsed.page, pageSize: SEARCH_PAGE_SIZE, sort }), null) : null;

  return (
    <section aria-labelledby="h">
      <div className="page-head"><h1 id="h">{parsed.ok ? <>Results for &ldquo;{parsed.q}&rdquo;</> : "Search"}</h1></div>
      <form action="/search" method="get" role="search" className="search-page">
        <label htmlFor="q" className="visually-hidden">Search news</label>
        <Icon name="search" size={18} className="search__icon" />
        <input id="q" name="q" type="search" defaultValue={parsed.ok ? parsed.q : ""} minLength={SEARCH_MIN} maxLength={SEARCH_MAX} placeholder="Search headlines and stories" autoComplete="off" required />
        <button type="submit" className="btn btn--primary">Search</button>
      </form>

      {!parsed.ok ? (
        parsed.reason === "too_short" ? <StateMessage kind="empty" title="Keep typing">Enter at least {SEARCH_MIN} characters.</StateMessage> : <StateMessage kind="empty" title="Search the newsroom">Try a topic, a name or a place.</StateMessage>
      ) : result?.failed ? (
        <StateMessage kind="error" title="Search is unavailable">Please try again shortly.</StateMessage>
      ) : result && result.data && result.data.items.length === 0 ? (
        <StateMessage kind="empty" title="No results found">
          Check the spelling or try fewer words. You can also browse a category:
          <span className="chips">{cats.data.slice(0, 6).map((c) => <a key={c.slug} href={`/category/${c.slug}`} className="chip">{c.name}</a>)}</span>
        </StateMessage>
      ) : result?.data ? (
        <>
          <p className="muted" role="status">{result.data.meta.total} {result.data.meta.total === 1 ? "result" : "results"}</p>
          <nav className="tabs" aria-label="Sort results">
            <Link href={`/search?q=${encodeURIComponent(parsed.q)}`} aria-current={sort === "relevance" ? "page" : undefined}>Most relevant</Link>
            <Link href={`/search?q=${encodeURIComponent(parsed.q)}&sort=latest`} aria-current={sort === "latest" ? "page" : undefined}>Latest</Link>
          </nav>
          <div className="feed">{result.data.items.map((a) => <ArticleRow key={a.id} article={a} />)}</div>
          <Pagination basePath="/search" page={result.data.meta.page} totalPages={result.data.meta.totalPages} params={sort === "latest" ? { q: parsed.q, sort } : { q: parsed.q }} />
        </>
      ) : null}
    </section>
  );
}
