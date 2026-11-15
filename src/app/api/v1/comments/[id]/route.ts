import { ok, route } from "@/lib/api/response";
import { readJson } from "@/lib/api/request";
import { requireAuth } from "@/server/auth/guard";
import { getDeps } from "@/server/container";
import { deleteComment, moderateComment, moderateSchema } from "@/server/comments/service";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const DELETE = route<Ctx>(async (req, { params }) => {
  const deps = getDeps();
  return ok(await deleteComment(deps, await requireAuth(deps, req), (await params).id));
});

/** Moderators only: { status: "HIDDEN" | "VISIBLE" }. */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  return ok(await moderateComment(deps, ctx, (await params).id, await readJson(req, moderateSchema, 1024)));
});
