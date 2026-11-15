import type { Metadata } from "next";
import Link from "next/link";
import { Pagination } from "@/components/news/Pagination";
import { StateMessage } from "@/components/ui/StateMessage";
import { StatusBadge } from "@/components/editorial/StatusBadge";
import { ARTICLE_STATUSES } from "@/lib/workflow";
import { listArticles } from "@/server/articles/service";
import { listArticlesQuery } from "@/server/articles/validation";
import { requirePageAccess } from "@/server/auth/page-guard";
import { getDeps } from "@/server/container";

export const metadata: Metadata = { title: "Articles (editorial)", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminArticles({ searchParams }: { searchParams: Promise<{ scope?: string; status?: string; page?: string }> }) {
  const sp = await searchParams;
  const access = await requirePageAccess("/admin/articles", "article:edit_any");
  if ("denied" in access) return access.denied;
  const parsed = listArticlesQuery.safeParse({ scope: sp.scope === "review" ? "review" : "all", page: sp.page, pageSize: 15, status: sp.status });
  const q = parsed.success ? parsed.data : listArticlesQuery.parse({ scope: "all" });
  const { items, meta } = await listArticles(getDeps(), access.ctx, q);
  const params: Record<string, string> = { ...(q.scope === "review" ? { scope: "review" } : {}), ...(q.status && q.scope !== "review" ? { status: q.status } : {}) };

  return (
    <div className="stack">
      <h1>Articles</h1>
      <nav className="tabs" aria-label="Views">
        <Link href="/admin/articles?scope=review" aria-current={q.scope === "review" ? "page" : undefined}>Review queue</Link>
        <Link href="/admin/articles" aria-current={q.scope === "all" && !q.status ? "page" : undefined}>All articles</Link>
        {q.scope === "all" ? ARTICLE_STATUSES.map((s) => <Link key={s} href={`/admin/articles?status=${s}`} aria-current={q.status === s ? "page" : undefined}>{s.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Link>) : null}
      </nav>
      {items.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <caption className="visually-hidden">{q.scope === "review" ? "Articles waiting for review" : "All articles"}</caption>
            <thead><tr><th scope="col">Headline</th><th scope="col">Author</th><th scope="col">Category</th><th scope="col">Status</th><th scope="col">Updated</th></tr></thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <th scope="row"><Link href={`/author/articles/${a.id}/edit`}>{a.title}</Link></th>
                  <td>{a.author.name}</td><td>{a.category.name}</td><td><StatusBadge status={a.status} /></td>
                  <td><time dateTime={a.updatedAt}>{a.updatedAt.slice(0, 10)}</time></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <StateMessage kind="empty" title={q.scope === "review" ? "The review queue is empty" : "No articles found"}>{q.scope === "review" ? "Submitted articles will appear here." : "Try another filter."}</StateMessage>}
      <Pagination basePath="/admin/articles" page={meta.page} totalPages={meta.totalPages} params={params} />
    </div>
  );
}
