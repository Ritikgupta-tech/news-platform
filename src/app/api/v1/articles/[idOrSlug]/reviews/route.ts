import { Errors } from "@/lib/api/errors";
import { ok, route } from "@/lib/api/response";
import { requireAuth } from "@/server/auth/guard";
import { isUuid } from "@/server/categories/service";
import { getDeps } from "@/server/container";
import { listReviews } from "@/server/editorial/service";

export const dynamic = "force-dynamic";

export const GET = route<{ params: Promise<{ idOrSlug: string }> }>(async (req, { params }) => {
  const { idOrSlug } = await params;
  if (!isUuid(idOrSlug)) throw Errors.notFound("Article");
  const deps = getDeps();
  return ok(await listReviews(deps, await requireAuth(deps, req), idOrSlug), undefined, { headers: { "Cache-Control": "private, no-store" } });
});
