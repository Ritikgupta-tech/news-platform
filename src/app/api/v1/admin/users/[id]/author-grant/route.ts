import { Errors } from "@/lib/api/errors";
import { ok, route } from "@/lib/api/response";
import { readJson } from "@/lib/api/request";
import { requireAuth } from "@/server/auth/guard";
import { isUuid } from "@/server/categories/service";
import { getDeps } from "@/server/container";
import { authorGrantSchema, setAuthorPublishGrant } from "@/server/users/service";

export const dynamic = "force-dynamic";

export const PATCH = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const deps = getDeps();
  const { id } = await params;
  if (!isUuid(id)) throw Errors.notFound("User");
  const ctx = await requireAuth(deps, req);
  const { canPublishDirectly } = await readJson(req, authorGrantSchema);
  return ok(await setAuthorPublishGrant(deps, ctx, id, canPublishDirectly));
});
