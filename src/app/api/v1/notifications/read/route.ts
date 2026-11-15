import { ok, route } from "@/lib/api/response";
import { readJson } from "@/lib/api/request";
import { requireAuth } from "@/server/auth/guard";
import { getDeps } from "@/server/container";
import { markNotificationsRead, markReadSchema } from "@/server/notifications/service";

export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  return ok(await markNotificationsRead(deps, ctx.id, await readJson(req, markReadSchema)));
});
