import { created, ok, route } from "@/lib/api/response";
import { queryParams, readJson } from "@/lib/api/request";
import { optionalAuth, requireAuth } from "@/server/auth/guard";
import { getDeps } from "@/server/container";
import { createComment, createCommentSchema, listComments, listCommentsQuery } from "@/server/comments/service";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ idOrSlug: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const deps = getDeps();
  const viewer = await optionalAuth(deps, req);
  const { items, meta } = await listComments(deps, (await params).idOrSlug, viewer?.id ?? null, listCommentsQuery.parse(queryParams(req)));
  return ok(items, meta, { headers: { "Cache-Control": "private, no-store" } });
});

export const POST = route<Ctx>(async (req, { params }) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  return created(await createComment(deps, ctx, (await params).idOrSlug, await readJson(req, createCommentSchema, 8 * 1024)));
});
