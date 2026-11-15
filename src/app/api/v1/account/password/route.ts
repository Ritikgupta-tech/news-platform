import { ok, route } from "@/lib/api/response";
import { readJson } from "@/lib/api/request";
import { changePassword, changePasswordSchema } from "@/server/account/service";
import { requireAuth } from "@/server/auth/guard";
import { getDeps } from "@/server/container";

export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  return ok(await changePassword(deps, ctx, await readJson(req, changePasswordSchema)));
});
