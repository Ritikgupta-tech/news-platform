import { ok, route } from "@/lib/api/response";
import { queryParams } from "@/lib/api/request";
import { requireAuth } from "@/server/auth/guard";
import { getAdminDashboard, dashboardQuery } from "@/server/admin/dashboard";
import { getDeps } from "@/server/container";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  return ok(await getAdminDashboard(deps, ctx, dashboardQuery.parse(queryParams(req))), undefined, { headers: { "Cache-Control": "private, no-store" } });
});
