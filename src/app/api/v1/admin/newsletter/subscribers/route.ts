import { ok, route } from "@/lib/api/response";
import { queryParams } from "@/lib/api/request";
import { requireAuth } from "@/server/auth/guard";
import { getDeps } from "@/server/container";
import { listSubscribers, listSubscribersQuery } from "@/server/newsletter/service";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  const { items, counts, meta } = await listSubscribers(deps, ctx, listSubscribersQuery.parse(queryParams(req)));
  return ok(items, { ...meta, counts }, { headers: { "Cache-Control": "private, no-store" } });
});
