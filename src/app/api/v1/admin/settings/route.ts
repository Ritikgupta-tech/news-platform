import { ok, route } from "@/lib/api/response";
import { readJson } from "@/lib/api/request";
import { requireAuth } from "@/server/auth/guard";
import { getDeps } from "@/server/container";
import {
  getSiteSettings,
  siteSettingsSchema,
  updateSiteSettings,
} from "@/server/settings/service";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const deps = getDeps();
  await requireAuth(deps, req);
  const settings = await getSiteSettings(deps);
  return ok(settings);
});

export const PATCH = route(async (req) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  const input = await readJson(req, siteSettingsSchema.partial());
  const updated = await updateSiteSettings(deps, ctx, input);
  return ok(updated);
});
