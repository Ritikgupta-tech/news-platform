import { ok, route } from "@/lib/api/response";
import { queryParams } from "@/lib/api/request";
import { getDeps } from "@/server/container";
import { listAdvertisements } from "@/server/advertisements/service";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const deps = getDeps();
  const q = queryParams(req);
  const placement = typeof q.placement === "string" ? q.placement : undefined;
  const items = await listAdvertisements(deps, null, placement, false);
  return ok(items, undefined, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
  });
});
