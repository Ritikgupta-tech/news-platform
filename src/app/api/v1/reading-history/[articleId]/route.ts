import { Errors } from "@/lib/api/errors";
import { ok, route } from "@/lib/api/response";
import { requireAuth } from "@/server/auth/guard";
import { isUuid } from "@/server/categories/service";
import { getDeps } from "@/server/container";
import { removeHistoryItem } from "@/server/reader/history";

export const dynamic = "force-dynamic";

export const DELETE = route<{ params: Promise<{ articleId: string }> }>(async (req, { params }) => {
  const { articleId } = await params;
  if (!isUuid(articleId)) throw Errors.notFound("History entry");
  const deps = getDeps();
  return ok(await removeHistoryItem(deps, (await requireAuth(deps, req)).id, articleId));
});
