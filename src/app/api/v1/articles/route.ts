import { created, ok, route } from "@/lib/api/response";
import { queryParams, readJson } from "@/lib/api/request";
import { createArticle, listArticles } from "@/server/articles/service";
import { createArticleSchema, listArticlesQuery } from "@/server/articles/validation";
import { optionalAuth, requireAuth } from "@/server/auth/guard";
import { getDeps } from "@/server/container";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const deps = getDeps();
  const query = listArticlesQuery.parse(queryParams(req));
  const ctx = query.scope === "public" ? null : await optionalAuth(deps, req);
  const { items, meta } = await listArticles(deps, ctx, query);
  return ok(items, meta, { headers: { "Cache-Control": query.scope === "public" ? "public, s-maxage=30, stale-while-revalidate=60" : "private, no-store" } });
});

export const POST = route(async (req) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  return created(await createArticle(deps, ctx, await readJson(req, createArticleSchema, 300 * 1024)));
});
