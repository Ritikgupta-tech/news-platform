import { ok, route } from "@/lib/api/response";
import { readJson } from "@/lib/api/request";
import { requireAuth } from "@/server/auth/guard";
import { getDeps } from "@/server/container";
import { scheduleCampaign, scheduleInput } from "@/server/newsletter/campaigns";

export const dynamic = "force-dynamic";

/** { scheduledAt?: ISO-8601 UTC }  Omit it to send at the next job run. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  return ok(await scheduleCampaign(deps, ctx, (await params).id, await readJson(req, scheduleInput, 1024)));
});
