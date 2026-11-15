import { ok, route } from "@/lib/api/response";
import { revokeOtherSessions } from "@/server/account/service";
import { requireAuth } from "@/server/auth/guard";
import { getDeps } from "@/server/container";

export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const deps = getDeps();
  return ok(await revokeOtherSessions(deps, await requireAuth(deps, req)));
});
