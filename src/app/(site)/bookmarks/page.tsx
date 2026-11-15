import type { Metadata } from "next";
import { Pagination } from "@/components/news/Pagination";
import { ActionButton } from "@/components/reader/ActionButton";
import { ReaderArticleRow } from "@/components/reader/ReaderArticleRow";
import { ButtonLink } from "@/components/ui/Button";
import { StateMessage } from "@/components/ui/StateMessage";
import { formatDate } from "@/lib/format";
import { requirePageAccess } from "@/server/auth/page-guard";
import { getDeps } from "@/server/container";
import { listBookmarks, pageQuery } from "@/server/reader/bookmarks";

export const metadata: Metadata = { title: "Saved articles", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function BookmarksPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const access = await requirePageAccess("/bookmarks", "bookmark:manage_own");
  if ("denied" in access) return access.denied;
  const parsed = pageQuery.safeParse({ page: (await searchParams).page, pageSize: 10 });
  const { items, meta } = await listBookmarks(getDeps(), access.ctx.id, parsed.success ? parsed.data : pageQuery.parse({}));
  return (
    <div className="stack">
      <div className="page-head"><h1>Saved articles</h1><span className="muted">{meta.total} saved</span></div>
      {items.length ? (
        <ul className="reader-list">
          {items.map((a) => (
            <ReaderArticleRow key={a.id} article={a} note={<>Saved {formatDate(a.bookmarkedAt)}</>}>
              <ActionButton endpoint={`/api/v1/bookmarks/${a.id}`} method="DELETE" label="Remove" ariaLabel={`Remove ${a.title} from saved articles`} />
            </ReaderArticleRow>
          ))}
        </ul>
      ) : (
        <StateMessage kind="empty" title="Nothing saved yet" action={<ButtonLink href="/news">Browse the latest news</ButtonLink>}>
          Use the Save button on any article to keep it here.
        </StateMessage>
      )}
      <Pagination basePath="/bookmarks" page={meta.page} totalPages={meta.totalPages} />
    </div>
  );
}
