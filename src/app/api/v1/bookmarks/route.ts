import { created, ok, route } from "@/lib/api/response";
import { queryParams, readJson } from "@/lib/api/request";
import { requireAuth } from "@/server/auth/guard";
import { getDeps } from "@/server/container";
import { addBookmark, bookmarkSchema, listBookmarks, pageQuery } from "@/server/reader/bookmarks";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  const { items, meta } = await listBookmarks(deps, ctx.id, pageQuery.parse(queryParams(req)));
  return ok(items, meta, { headers: { "Cache-Control": "private, no-store" } });
});

export const POST = route(async (req) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  const { articleId } = await readJson(req, bookmarkSchema);
  return created(await addBookmark(deps, ctx.id, articleId));
});
