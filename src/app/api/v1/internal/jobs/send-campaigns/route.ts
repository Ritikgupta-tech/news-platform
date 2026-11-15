import { ok, route } from "@/lib/api/response";
import { getDeps } from "@/server/container";
import { sendDueCampaigns } from "@/server/newsletter/sender";
import { requireCronAuth } from "@/server/security/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Same scheduler as publish-scheduled, every minute:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://host/api/v1/internal/jobs/send-campaigns
 * Sends due newsletter campaigns in time-boxed batches; the next call continues where this one stopped.
 */
export const POST = route(async (req) => {
  const deps = getDeps();
  requireCronAuth(deps, req);
  return ok(await sendDueCampaigns(deps, { maxMs: 45_000 }), undefined, { headers: { "Cache-Control": "no-store" } });
});
