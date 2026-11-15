import type { Metadata } from "next";
import Link from "next/link";
import { Pagination } from "@/components/news/Pagination";
import { ButtonLink } from "@/components/ui/Button";
import { StateMessage } from "@/components/ui/StateMessage";
import { StatusBadge } from "@/components/editorial/StatusBadge";
import { ARTICLE_STATUSES } from "@/lib/workflow";
import { listArticles } from "@/server/articles/service";
import { listArticlesQuery } from "@/server/articles/validation";
import { requirePageAccess } from "@/server/auth/page-guard";
import { getDeps } from "@/server/container";

export const metadata: Metadata = { title: "My articles", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function MyArticles({ searchParams }: { searchParams: Promise<{ status?: string; page?: string; submitted?: string }> }) {
  const sp = await searchParams;
  const access = await requirePageAccess("/author/articles", "article:create");
  if ("denied" in access) return access.denied;
  const parsed = listArticlesQuery.safeParse({ scope: "mine", page: sp.page, pageSize: 10, status: sp.status });
  const q = parsed.success ? parsed.data : listArticlesQuery.parse({ scope: "mine" });
  const { items, meta } = await listArticles(getDeps(), access.ctx, q);

  return (
    <div className="stack">
      <div className="page-head"><h1>My articles</h1><ButtonLink href="/author/articles/new">New article</ButtonLink></div>
      {sp.submitted ? <p className="notice" role="status">Submitted for review. An editor has been notified.</p> : null}
      <nav className="tabs" aria-label="Filter by status">
        <Link href="/author/articles" aria-current={!q.status ? "page" : undefined}>All</Link>
        {ARTICLE_STATUSES.map((s) => <Link key={s} href={`/author/articles?status=${s}`} aria-current={q.status === s ? "page" : undefined}>{s.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Link>)}
      </nav>
      {items.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <caption className="visually-hidden">Your articles</caption>
            <thead><tr><th scope="col">Headline</th><th scope="col">Status</th><th scope="col">Category</th><th scope="col">Updated</th></tr></thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <th scope="row"><Link href={`/author/articles/${a.id}/edit`}>{a.title}</Link></th>
                  <td><StatusBadge status={a.status} /></td>
                  <td>{a.category.name}</td>
                  <td><time dateTime={a.updatedAt}>{a.updatedAt.slice(0, 10)}</time></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <StateMessage kind="empty" title={q.status ? "Nothing with that status" : "No articles yet"} action={<ButtonLink href="/author/articles/new">New article</ButtonLink>}>
          {q.status ? "Try another filter." : "Start a draft and submit it when it’s ready."}
        </StateMessage>
      )}
      <Pagination basePath="/author/articles" page={meta.page} totalPages={meta.totalPages} params={q.status ? { status: q.status } : {}} />
    </div>
  );
}
