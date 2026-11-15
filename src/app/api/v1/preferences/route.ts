import { ok, route } from "@/lib/api/response";
import { readJson } from "@/lib/api/request";
import { requireAuth } from "@/server/auth/guard";
import { getDeps } from "@/server/container";
import { getPreferences, updatePreferences, updatePreferencesSchema } from "@/server/reader/preferences";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const deps = getDeps();
  return ok(await getPreferences(deps, (await requireAuth(deps, req)).id), undefined, { headers: { "Cache-Control": "private, no-store" } });
});

export const PUT = route(async (req) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  return ok(await updatePreferences(deps, ctx.id, await readJson(req, updatePreferencesSchema)));
});
