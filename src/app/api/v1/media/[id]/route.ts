import { Errors } from "@/lib/api/errors";
import { noContent, route } from "@/lib/api/response";
import { requireAuth } from "@/server/auth/guard";
import { isUuid } from "@/server/categories/service";
import { getDeps } from "@/server/container";
import { deleteMedia } from "@/server/media/service";

export const dynamic = "force-dynamic";

export const DELETE = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const deps = getDeps();
  const { id } = await params;
  if (!isUuid(id)) throw Errors.notFound("Image");
  await deleteMedia(deps, await requireAuth(deps, req), id);
  return noContent();
});
