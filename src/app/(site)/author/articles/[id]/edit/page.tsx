import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleEditor } from "@/components/editorial/ArticleEditor";
import { EditorialPanel } from "@/components/editorial/EditorialPanel";
import { RevisionHistory } from "@/components/editorial/RevisionHistory";
import { StatusBadge } from "@/components/editorial/StatusBadge";
import { ApiError } from "@/lib/api/errors";
import { decideEdit } from "@/server/articles/policy";
import { getArticleForActor } from "@/server/articles/service";
import { requirePageAccess } from "@/server/auth/page-guard";
import { listCategories, isUuid } from "@/server/categories/service";
import { getDeps } from "@/server/container";
import { availableActions } from "@/server/editorial/actions";
import { listReviews, listRevisions } from "@/server/editorial/service";

export const metadata: Metadata = { title: "Edit article", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function EditArticle({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const created = (await searchParams).created === "1";
  if (!isUuid(id)) notFound();
  const access = await requirePageAccess(`/author/articles/${id}/edit`, "article:create");
  if ("denied" in access) return access.denied;
  const { ctx } = access;
  const deps = getDeps();

  let article;
  try {
    article = await getArticleForActor(deps, ctx, id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound(); // also hides other people's drafts
    throw e;
  }
  const target = { authorId: article.author.id, status: article.status };
  const [categories, reviews, revisions, activeCats] = await Promise.all([
    listCategories(deps, ctx, true), listReviews(deps, ctx, id), listRevisions(deps, ctx, id), listCategories(deps, ctx, false),
  ]);
  const hero = article.heroImageId ? await deps.db.mediaAsset.findFirst({ where: { id: article.heroImageId, deletedAt: null }, select: { id: true, url: true, altText: true, caption: true, credit: true } }) : null;
  const actions = availableActions(ctx, target);
  const canEdit = decideEdit(ctx, target).ok;
  const latestFeedback = article.status === "CHANGES_REQUESTED" ? reviews.find((r) => r.decision === "CHANGES_REQUESTED") : undefined;
  const options = (canEdit ? activeCats : categories).filter((c) => c.isActive || c.id === article.category.id);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <p className="muted"><Link href="/author/articles">My articles</Link> / Edit</p>
          <h1>{article.title}</h1>
        </div>
        <StatusBadge status={article.status} />
      </div>

      {created ? <p className="editor__saved" role="status">Draft saved. You can keep editing, or submit it for review when it’s ready.</p> : null}
      {latestFeedback ? (
        <section className="notice notice--error" aria-labelledby="fb"><h2 id="fb">Changes requested by {latestFeedback.reviewer.name}</h2><p>{latestFeedback.reason}</p></section>
      ) : null}

      <div className="edit-layout">
        <ArticleEditor
          categories={options.map((c) => ({ id: c.id, name: c.name }))}
          canEdit={canEdit}
          canSubmit={actions.some((a) => a.action === "submit")}
          article={{
            id: article.id, version: article.version, status: article.status, title: article.title, subtitle: article.subtitle ?? "",
            summary: article.summary, bodyHtml: article.bodyHtml, categoryId: article.category.id, tags: article.tags.map((t) => t.name),
            sourceName: article.sourceName ?? "", sourceUrl: article.sourceUrl ?? "", heroImage: hero,
          }}
        />
        <div className="stack edit-layout__side">
          <EditorialPanel articleId={article.id} version={article.version} actions={actions.filter((a) => a.action !== "submit")} scheduledFor={article.scheduledFor} />
          <section className="panel" aria-label="Review history">
            <h2 className="panel__title">Review history</h2>
            {reviews.length ? (
              <ul className="plain-list">
                {reviews.map((r) => (
                  <li key={r.id}>
                    <strong>{r.decision.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</strong> <span className="muted">by {r.reviewer.name} · {r.createdAt.slice(0, 10)}</span>
                    {r.reason ? <p>{r.reason}</p> : null}
                  </li>
                ))}
              </ul>
            ) : <p className="auth__hint">No review decisions yet.</p>}
          </section>
          <RevisionHistory revisions={revisions.map((r) => ({ version: r.version, title: r.title, summary: r.summary, bodyHtml: r.bodyHtml, changeNote: r.changeNote, editedBy: { name: r.editedBy.name }, createdAt: r.createdAt }))} />
        </div>
      </div>
    </div>
  );
}
