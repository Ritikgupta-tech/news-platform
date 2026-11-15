import { created, ok, route } from "@/lib/api/response";
import { readJson } from "@/lib/api/request";
import { optionalAuth, requireAuth } from "@/server/auth/guard";
import { createCategory, createCategorySchema, listCategories } from "@/server/categories/service";
import { getDeps } from "@/server/container";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const deps = getDeps();
  const includeInactive = new URL(req.url).searchParams.get("includeInactive") === "true";
  const ctx = includeInactive ? await optionalAuth(deps, req) : null;
  return ok(await listCategories(deps, ctx, includeInactive), undefined, { headers: { "Cache-Control": includeInactive ? "private, no-store" : "public, s-maxage=60, stale-while-revalidate=300" } });
});

export const POST = route(async (req) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  return created(await createCategory(deps, ctx, await readJson(req, createCategorySchema)));
});
