import { ok, route } from "@/lib/api/response";
import { queryParams } from "@/lib/api/request";
import { requireAuth } from "@/server/auth/guard";
import { getAuthorStats, rangeFromQuery, rangeQuery } from "@/server/analytics/reports";
import { getDeps } from "@/server/container";

export const dynamic = "force-dynamic";

/** GET /api/v1/analytics/authors?preset=today|7d|30d|90d  or  ?from=YYYY-MM-DD&to=YYYY-MM-DD */
export const GET = route(async (req) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  const q = rangeQuery.parse(queryParams(req));
  const range = rangeFromQuery(deps, q);
  return ok(await getAuthorStats(deps, ctx, range), undefined, { headers: { "Cache-Control": "private, no-store" } });
});
