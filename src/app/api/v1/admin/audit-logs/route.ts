import { ok, route } from "@/lib/api/response";
import { queryParams } from "@/lib/api/request";
import { requireAuth } from "@/server/auth/guard";
import { getDeps } from "@/server/container";
import { listAuditLogs, listAuditQuery } from "@/server/users/service";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  const { items, meta } = await listAuditLogs(deps, ctx, listAuditQuery.parse(queryParams(req)));
  return ok(items, meta, { headers: { "Cache-Control": "private, no-store" } });
});
