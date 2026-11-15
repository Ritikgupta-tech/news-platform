import { ok, route } from "@/lib/api/response";
import { readJson } from "@/lib/api/request";
import { requireAuth } from "@/server/auth/guard";
import { getDeps } from "@/server/container";
import { getCampaign, updateCampaign, updateCampaignInput } from "@/server/newsletter/campaigns";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };

export const GET = route<P>(async (req, { params }) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  return ok(await getCampaign(deps, ctx, (await params).id), undefined, { headers: { "Cache-Control": "private, no-store" } });
});

/** Drafts only. Body must include the `version` you loaded; a mismatch is 409 VERSION_CONFLICT. */
export const PATCH = route<P>(async (req, { params }) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  return ok(await updateCampaign(deps, ctx, (await params).id, await readJson(req, updateCampaignInput, 40 * 1024)));
});
