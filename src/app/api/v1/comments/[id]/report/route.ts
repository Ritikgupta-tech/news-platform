import { ok, route } from "@/lib/api/response";
import { requireAuth } from "@/server/auth/guard";
import { getDeps } from "@/server/container";
import { reportComment } from "@/server/comments/service";

export const dynamic = "force-dynamic";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const deps = getDeps();
  return ok(await reportComment(deps, await requireAuth(deps, req), (await params).id));
});
