import type { Metadata } from "next";
import Link from "next/link";
import { Pagination } from "@/components/news/Pagination";
import { ActionButton } from "@/components/reader/ActionButton";
import { StateMessage } from "@/components/ui/StateMessage";
import { formatRelative } from "@/lib/format";
import { requirePageAccess } from "@/server/auth/page-guard";
import { getDeps } from "@/server/container";
import { listNotifications, listNotificationsQuery } from "@/server/notifications/service";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ page?: string; unreadOnly?: string }> }) {
  const access = await requirePageAccess("/notifications", "article:read");
  if ("denied" in access) return access.denied;
  const sp = await searchParams;
  const parsed = listNotificationsQuery.safeParse({ page: sp.page, pageSize: 15, unreadOnly: sp.unreadOnly === "true" ? "true" : "false" });
  const q = parsed.success ? parsed.data : listNotificationsQuery.parse({});
  const { items, meta } = await listNotifications(getDeps(), access.ctx.id, q);
  return (
    <div className="stack">
      <div className="page-head">
        <h1>Notifications</h1>
        {meta.unreadCount > 0 ? <ActionButton endpoint="/api/v1/notifications/read" method="POST" body={{ all: true }} label={`Mark all ${meta.unreadCount} as read`} variant="secondary" /> : null}
      </div>
      <nav className="tabs" aria-label="Filter">
        <Link href="/notifications" aria-current={q.unreadOnly === "false" ? "page" : undefined}>All</Link>
        <Link href="/notifications?unreadOnly=true" aria-current={q.unreadOnly === "true" ? "page" : undefined}>Unread ({meta.unreadCount})</Link>
      </nav>
      {items.length ? (
        <ul className="reader-list">
          {items.map((n) => (
            <li key={n.id} className={`reader-row${n.read ? "" : " reader-row--unread"}`}>
              <div className="reader-row__main">
                {n.href ? <Link className="reader-row__title" href={n.href}>{n.title}</Link> : <span className="reader-row__title">{n.title}</span>}
                <p className="meta"><time dateTime={n.createdAt}>{formatRelative(n.createdAt)}</time>{n.read ? "" : " · Unread"}</p>
              </div>
              {n.read ? null : <ActionButton endpoint="/api/v1/notifications/read" method="POST" body={{ ids: [n.id] }} label="Mark read" ariaLabel={`Mark “${n.title}” as read`} />}
            </li>
          ))}
        </ul>
      ) : (
        <StateMessage kind="empty" title={q.unreadOnly === "true" ? "You’re all caught up" : "No notifications yet"}>
          {q.unreadOnly === "true" ? "There’s nothing unread." : "Updates about your articles and account will show up here."}
        </StateMessage>
      )}
      <Pagination basePath="/notifications" page={meta.page} totalPages={meta.totalPages} params={q.unreadOnly === "true" ? { unreadOnly: "true" } : {}} />
    </div>
  );
}
