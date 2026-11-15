import { noContent, ok, route } from "@/lib/api/response";
import { readJson } from "@/lib/api/request";
import { deleteArticle, getArticleForActor, getPublishedBySlug, updateArticle } from "@/server/articles/service";
import { updateArticleSchema } from "@/server/articles/validation";
import { optionalAuth, requireAuth } from "@/server/auth/guard";
import { isUuid } from "@/server/categories/service";
import { getDeps } from "@/server/container";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ idOrSlug: string }> };

/** A UUID loads any article the caller may see (author/editor tools); anything else is a public slug lookup. */
export const GET = route<Ctx>(async (req, { params }) => {
  const deps = getDeps();
  const { idOrSlug } = await params;
  if (isUuid(idOrSlug)) {
    const ctx = await optionalAuth(deps, req);
    const article = await getArticleForActor(deps, ctx, idOrSlug);
    return ok(article, undefined, { headers: { "Cache-Control": "private, no-store" } });
  }
  return ok(await getPublishedBySlug(deps, idOrSlug), undefined, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const deps = getDeps();
  const { idOrSlug } = await params;
  const ctx = await requireAuth(deps, req);
  return ok(await updateArticle(deps, ctx, idOrSlug, await readJson(req, updateArticleSchema, 300 * 1024)));
});

export const DELETE = route<Ctx>(async (req, { params }) => {
  const deps = getDeps();
  const { idOrSlug } = await params;
  await deleteArticle(deps, await requireAuth(deps, req), idOrSlug);
  return noContent();
});
