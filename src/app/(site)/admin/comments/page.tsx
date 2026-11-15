import type { Metadata } from "next";
import Link from "next/link";
import { CommentStatus } from "@prisma/client";
import { Pagination } from "@/components/news/Pagination";
import { ActionButton } from "@/components/reader/ActionButton";
import { StateMessage } from "@/components/ui/StateMessage";
import { requirePageAccess } from "@/server/auth/page-guard";
import { getDeps } from "@/server/container";
import { listForModeration, moderationQuery } from "@/server/comments/service";

export const metadata: Metadata = { title: "Comment moderation", robots: { index: false } };
export const dynamic = "force-dynamic";

const FILTERS = Object.values(CommentStatus);

export default async function AdminComments({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const access = await requirePageAccess("/admin/comments", "comment:moderate");
  if ("denied" in access) return access.denied;
  const sp = await searchParams;
  const status = FILTERS.find((s) => s === sp.status);
  const parsed = moderationQuery.safeParse({ status, page: sp.page, pageSize: 20 });
  const q = parsed.success ? parsed.data : moderationQuery.parse({ pageSize: 20 });
  const { items, meta } = await listForModeration(getDeps(), access.ctx, q);

  return (
    <div className="stack">
      <div className="page-head"><h1>Comment moderation</h1><p className="muted">Reported comments stay visible until you hide them. Every action is audited.</p></div>
      <nav className="tabs" aria-label="Filter by status">
        <Link href="/admin/comments" aria-current={!status ? "page" : undefined}>Needs attention</Link>
        {FILTERS.map((s) => <Link key={s} href={`/admin/comments?status=${s}`} aria-current={status === s ? "page" : undefined}>{s.charAt(0) + s.slice(1).toLowerCase()}</Link>)}
      </nav>
      {items.length ? (
        <ul className="comment-list">
          {items.map((c) => (
            <li key={c.id} className="comment">
              <p><strong>{c.author}</strong> on <Link href={`/news/${c.articleSlug}#comments`}>{c.articleTitle}</Link> <span className="muted">· {c.status.toLowerCase()} · <time dateTime={c.createdAt}>{c.createdAt.slice(0, 16).replace("T", " ")} UTC</time></span></p>
              <p className="comment__body">{c.body}</p>
              <p>
                {c.status === "HIDDEN" ? <ActionButton endpoint={`/api/v1/comments/${c.id}`} method="PATCH" body={{ status: "VISIBLE" }} label="Restore" variant="secondary" /> : <ActionButton endpoint={`/api/v1/comments/${c.id}`} method="PATCH" body={{ status: "HIDDEN" }} label="Hide" variant="secondary" />}
                {c.status === "REPORTED" ? <ActionButton endpoint={`/api/v1/comments/${c.id}`} method="PATCH" body={{ status: "VISIBLE" }} label="Dismiss report" /> : null}
                <ActionButton endpoint={`/api/v1/comments/${c.id}`} method="DELETE" label="Delete" variant="danger" confirm="Delete this comment permanently from view?" />
              </p>
            </li>
          ))}
        </ul>
      ) : <StateMessage kind="empty" title="Nothing to review">No comments match this filter.</StateMessage>}
      <Pagination basePath="/admin/comments" page={meta.page} totalPages={meta.totalPages} params={status ? { status } : {}} />
    </div>
  );
}
