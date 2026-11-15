import { created, ok, route } from "@/lib/api/response";
import { queryParams, readJson } from "@/lib/api/request";
import { requireAuth } from "@/server/auth/guard";
import { getDeps } from "@/server/container";
import { createTag, createTagSchema, listTags, listTagsQuery } from "@/server/tags/service";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const { items, meta } = await listTags(getDeps(), listTagsQuery.parse(queryParams(req)));
  return ok(items, meta, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
});

export const POST = route(async (req) => {
  const deps = getDeps();
  return created(await createTag(deps, await requireAuth(deps, req), await readJson(req, createTagSchema)));
});
