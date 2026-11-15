import { ok, route } from "@/lib/api/response";
import { getDeps } from "@/server/container";
import { publishDueArticles } from "@/server/editorial/scheduler";
import { requireCronAuth } from "@/server/security/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Called by your scheduler (cron, Vercel Cron, GitHub Actions, systemd timer) every minute:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://host/api/v1/internal/jobs/publish-scheduled
 * Not cookie-authenticated, so no CSRF surface. Disabled (404) unless CRON_SECRET is configured.
 */
export const POST = route(async (req) => {
  const deps = getDeps();
  requireCronAuth(deps, req);
  return ok(await publishDueArticles(deps), undefined, { headers: { "Cache-Control": "no-store" } });
});
