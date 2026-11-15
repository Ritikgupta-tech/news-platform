import { ok, route } from "@/lib/api/response";
import { readJson } from "@/lib/api/request";
import { updateProfile, updateProfileSchema } from "@/server/account/service";
import { requireAuth } from "@/server/auth/guard";
import { getDeps } from "@/server/container";

export const dynamic = "force-dynamic";

export const PATCH = route(async (req) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  return ok({ user: await updateProfile(deps, ctx.id, await readJson(req, updateProfileSchema)) });
});
