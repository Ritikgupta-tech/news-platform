import { noContent, ok, route } from "@/lib/api/response";
import { readJson } from "@/lib/api/request";
import { Errors } from "@/lib/api/errors";
import { requireAuth } from "@/server/auth/guard";
import { isUuid } from "@/server/categories/service";
import { getDeps } from "@/server/container";
import { deleteTag, updateTag, updateTagSchema } from "@/server/tags/service";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req, { params }) => {
  const deps = getDeps();
  const { id } = await params;
  if (!isUuid(id)) throw Errors.notFound("Tag");
  return ok(await updateTag(deps, await requireAuth(deps, req), id, await readJson(req, updateTagSchema)));
});

export const DELETE = route<Ctx>(async (req, { params }) => {
  const deps = getDeps();
  const { id } = await params;
  if (!isUuid(id)) throw Errors.notFound("Tag");
  await deleteTag(deps, await requireAuth(deps, req), id);
  return noContent();
});
