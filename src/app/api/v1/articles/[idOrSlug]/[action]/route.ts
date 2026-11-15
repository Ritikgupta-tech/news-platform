import { Errors } from "@/lib/api/errors";
import { ok, route } from "@/lib/api/response";
import { requireAuth } from "@/server/auth/guard";
import { isUuid } from "@/server/categories/service";
import { getDeps } from "@/server/container";
import { applyAction } from "@/server/editorial/service";
import { isAction } from "@/server/editorial/validation";

export const dynamic = "force-dynamic";

/** POST /articles/{id}/{submit|start-review|request-changes|approve|reject|publish|schedule|cancel-schedule|archive} */
export const POST = route<{ params: Promise<{ idOrSlug: string; action: string }> }>(async (req, { params }) => {
  const { idOrSlug, action } = await params;
  if (!isUuid(idOrSlug) || !isAction(action)) throw Errors.notFound("Resource");
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  const body: unknown = await req.json().catch(() => ({}));
  return ok(await applyAction(deps, ctx, idOrSlug, action, body));
});
