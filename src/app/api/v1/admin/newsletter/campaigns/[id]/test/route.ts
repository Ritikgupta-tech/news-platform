import { ok, route } from "@/lib/api/response";
import { requireAuth } from "@/server/auth/guard";
import { getDeps } from "@/server/container";
import { sendTestCampaign } from "@/server/newsletter/campaigns";

export const dynamic = "force-dynamic";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  return ok(await sendTestCampaign(deps, ctx, (await params).id));
});
