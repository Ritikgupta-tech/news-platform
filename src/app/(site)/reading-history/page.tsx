import type { Metadata } from "next";
import Link from "next/link";
import { Pagination } from "@/components/news/Pagination";
import { ActionButton } from "@/components/reader/ActionButton";
import { ReaderArticleRow } from "@/components/reader/ReaderArticleRow";
import { ButtonLink } from "@/components/ui/Button";
import { StateMessage } from "@/components/ui/StateMessage";
import { formatRelative } from "@/lib/format";
import { requirePageAccess } from "@/server/auth/page-guard";
import { getDeps } from "@/server/container";
import { pageQuery } from "@/server/reader/bookmarks";
import { listHistory } from "@/server/reader/history";
import { getPreferences } from "@/server/reader/preferences";

export const metadata: Metadata = { title: "Reading history", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const access = await requirePageAccess("/reading-history", "bookmark:manage_own");
  if ("denied" in access) return access.denied;
  const deps = getDeps();
  const parsed = pageQuery.safeParse({ page: (await searchParams).page, pageSize: 10 });
  const [{ items, meta }, prefs] = await Promise.all([listHistory(deps, access.ctx.id, parsed.success ? parsed.data : pageQuery.parse({})), getPreferences(deps, access.ctx.id)]);
  return (
    <div className="stack">
      <div className="page-head">
        <h1>Reading history</h1>
        {items.length ? <ActionButton endpoint="/api/v1/reading-history" method="DELETE" label="Clear history" variant="secondary" confirm="Clear your whole reading history?" /> : null}
      </div>
      <p className="muted">Only you can see this. {prefs.recordReadingHistory ? <>It keeps your last 500 reads. <Link href="/preferences">Turn it off</Link>.</> : <>Recording is <strong>off</strong>. <Link href="/preferences">Change this</Link>.</>}</p>
      {items.length ? (
        <ul className="reader-list">
          {items.map((a) => (
            <ReaderArticleRow key={a.id} article={a} note={<>Read {formatRelative(a.lastReadAt)}</>}>
              <ActionButton endpoint={`/api/v1/reading-history/${a.id}`} method="DELETE" label="Remove" ariaLabel={`Remove ${a.title} from your history`} />
            </ReaderArticleRow>
          ))}
        </ul>
      ) : (
        <StateMessage kind="empty" title="No reading history" action={<ButtonLink href="/news">Start reading</ButtonLink>}>
          Articles you read for a few seconds will appear here.
        </StateMessage>
      )}
      <Pagination basePath="/reading-history" page={meta.page} totalPages={meta.totalPages} />
    </div>
  );
}
