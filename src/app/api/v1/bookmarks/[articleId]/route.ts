import { Errors } from "@/lib/api/errors";
import { ok, route } from "@/lib/api/response";
import { requireAuth } from "@/server/auth/guard";
import { isUuid } from "@/server/categories/service";
import { getDeps } from "@/server/container";
import { removeBookmark } from "@/server/reader/bookmarks";

export const dynamic = "force-dynamic";

export const DELETE = route<{ params: Promise<{ articleId: string }> }>(async (req, { params }) => {
  const { articleId } = await params;
  if (!isUuid(articleId)) throw Errors.notFound("Bookmark");
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  return ok(await removeBookmark(deps, ctx.id, articleId));
});
