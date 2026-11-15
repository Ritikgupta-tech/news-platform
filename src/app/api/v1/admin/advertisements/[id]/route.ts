import { noContent, ok, route } from "@/lib/api/response";
import { readJson } from "@/lib/api/request";
import { requireAuth } from "@/server/auth/guard";
import { getDeps } from "@/server/container";
import {
  deleteAdvertisement,
  getAdvertisement,
  updateAdvertisement,
  updateAdvertisementSchema,
} from "@/server/advertisements/service";

export const dynamic = "force-dynamic";

export const GET = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const deps = getDeps();
  await requireAuth(deps, req);
  const { id } = await params;
  return ok(await getAdvertisement(deps, id));
});

export const PATCH = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  const { id } = await params;
  const input = await readJson(req, updateAdvertisementSchema);
  return ok(await updateAdvertisement(deps, ctx, id, input));
});

export const DELETE = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  const { id } = await params;
  await deleteAdvertisement(deps, ctx, id);
  return noContent();
});
