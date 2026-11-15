import { ok, route } from "@/lib/api/response";
import { requireAuth } from "@/server/auth/guard";
import { getDeps } from "@/server/container";
import { getHomepageConfig } from "@/server/homepage/service";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  return ok(await getHomepageConfig(deps, ctx), undefined, { headers: { "Cache-Control": "private, no-store" } });
});
