import { noContent, ok, route } from "@/lib/api/response";
import { readJson } from "@/lib/api/request";
import { Errors } from "@/lib/api/errors";
import { optionalAuth, requireAuth } from "@/server/auth/guard";
import { deleteCategory, getCategory, isUuid, updateCategory, updateCategorySchema } from "@/server/categories/service";
import { getDeps } from "@/server/container";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ idOrSlug: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const deps = getDeps();
  const { idOrSlug } = await params;
  return ok(await getCategory(deps, await optionalAuth(deps, req), idOrSlug));
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const deps = getDeps();
  const { idOrSlug } = await params;
  if (!isUuid(idOrSlug)) throw Errors.notFound("Category");
  const ctx = await requireAuth(deps, req);
  return ok(await updateCategory(deps, ctx, idOrSlug, await readJson(req, updateCategorySchema)));
});

export const DELETE = route<Ctx>(async (req, { params }) => {
  const deps = getDeps();
  const { idOrSlug } = await params;
  if (!isUuid(idOrSlug)) throw Errors.notFound("Category");
  await deleteCategory(deps, await requireAuth(deps, req), idOrSlug);
  return noContent();
});
