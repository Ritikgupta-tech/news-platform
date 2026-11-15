import { noContent, ok, route } from "@/lib/api/response";
import { readJson } from "@/lib/api/request";
import { requireAuth } from "@/server/auth/guard";
import { getDeps } from "@/server/container";
import { promoSchema, setPromo } from "@/server/homepage/service";

export const dynamic = "force-dynamic";

export const PUT = route(async (req) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  return ok(await setPromo(deps, ctx, await readJson(req, promoSchema)));
});

export const DELETE = route(async (req) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  await setPromo(deps, ctx, null);
  return noContent();
});
