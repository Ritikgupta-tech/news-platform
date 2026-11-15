import { ok, route } from "@/lib/api/response";
import { queryParams, readJson } from "@/lib/api/request";
import { requireAuth } from "@/server/auth/guard";
import { getDeps } from "@/server/container";
import { pageQuery } from "@/server/reader/bookmarks";
import { clearHistory, listHistory, recordRead, recordSchema } from "@/server/reader/history";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  const { items, meta } = await listHistory(deps, ctx.id, pageQuery.parse(queryParams(req)));
  return ok(items, meta, { headers: { "Cache-Control": "private, no-store" } });
});

/** Called by the article page after the reader has stayed for a few seconds. */
export const POST = route(async (req) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  const { articleId } = await readJson(req, recordSchema);
  return ok(await recordRead(deps, ctx.id, articleId));
});

export const DELETE = route(async (req) => {
  const deps = getDeps();
  return ok(await clearHistory(deps, (await requireAuth(deps, req)).id));
});
