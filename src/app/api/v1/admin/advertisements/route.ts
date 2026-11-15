import { created, ok, route } from "@/lib/api/response";
import { queryParams, readJson } from "@/lib/api/request";
import { requireAuth } from "@/server/auth/guard";
import { getDeps } from "@/server/container";
import {
  createAdvertisement,
  createAdvertisementSchema,
  listAdvertisements,
} from "@/server/advertisements/service";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  const q = queryParams(req);
  const placement = typeof q.placement === "string" ? q.placement : undefined;
  const items = await listAdvertisements(deps, ctx, placement, true);
  return ok(items);
});

export const POST = route(async (req) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  const input = await readJson(req, createAdvertisementSchema);
  const ad = await createAdvertisement(deps, ctx, input);
  return created(ad);
});
