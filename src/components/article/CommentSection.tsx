import Link from "next/link";
import { CommentForm } from "@/components/article/CommentForm";
import { ActionButton } from "@/components/reader/ActionButton";
import { StateMessage } from "@/components/ui/StateMessage";
import { formatDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { getDeps } from "@/server/container";
import { listComments } from "@/server/comments/service";

/** Server component: comments are plain text rendered by React (escaped), never as HTML. Shows the first 50. */
export async function CommentSection({ articleId, slug, viewer }: { articleId: string; slug: string; viewer: { id: string; roles: readonly string[] } | null }) {
  let data: Awaited<ReturnType<typeof listComments>> | null = null;
  try { data = await listComments(getDeps(), articleId, viewer?.id ?? null, { page: 1, pageSize: 50 }); } catch (e) { console.error("[comments] load failed", e); }
  const moderator = !!viewer && can(viewer.roles, "comment:moderate");
  return (
    <section id="comments" aria-labelledby="comments-h" className="stack">
      <div className="section-heading"><h2 id="comments-h">Comments{data ? ` (${data.meta.total})` : ""}</h2></div>
      {viewer ? <CommentForm articleId={articleId} /> : <p><Link href={`/login?next=${encodeURIComponent(`/news/${slug}#comments`)}`}>Log in</Link> to join the conversation.</p>}
      {!data ? <StateMessage kind="error" title="Comments are unavailable">Please try again shortly.</StateMessage>
        : data.items.length === 0 ? <StateMessage kind="empty" title="No comments yet">Be the first to share a thought.</StateMessage>
        : (
          <ul className="comment-list">
            {data.items.map((c) => (
              <li key={c.id} className="comment">
                <p><strong>{c.author.name}</strong> <time className="muted" dateTime={c.createdAt}>{formatDate(c.createdAt)}</time></p>
                <p className="comment__body">{c.body}</p>
                <p>
                  {c.mine || moderator ? <ActionButton endpoint={`/api/v1/comments/${c.id}`} method="DELETE" label="Delete" confirm="Delete this comment?" ariaLabel="Delete comment" /> : null}
                  {viewer && !c.mine ? <ActionButton endpoint={`/api/v1/comments/${c.id}/report`} method="POST" label={c.reported ? "Reported" : "Report"} ariaLabel="Report comment" doneMessage="Thanks, we’ll review it." /> : null}
                </p>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
