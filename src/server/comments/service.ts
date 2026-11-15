import { CommentStatus, type Prisma } from "@prisma/client";
import { z } from "zod";
import { Errors } from "@/lib/api/errors";
import { buildPageMeta, paginationSchema, toSkipTake } from "@/lib/api/pagination";
import { can } from "@/lib/permissions";
import { writeAudit } from "@/server/audit/audit";
import { requirePermission, type AuthContext } from "@/server/auth/guard";
import { isUuid } from "@/server/categories/service";
import { liveWhere } from "@/server/articles/service";
import type { Deps } from "@/server/container";
import { enforceRateLimit } from "@/server/security/rate-limit";

export const COMMENT_MIN = 2;
export const COMMENT_MAX = 1500;
export const createCommentSchema = z.object({ body: z.string().trim().min(COMMENT_MIN, "Write at least a couple of characters").max(COMMENT_MAX, `Keep it under ${COMMENT_MAX} characters`) });
export const moderateSchema = z.object({ status: z.enum(["VISIBLE", "HIDDEN"]) });
export const listCommentsQuery = paginationSchema;
export const moderationQuery = paginationSchema.extend({ status: z.nativeEnum(CommentStatus).optional() });

export interface CommentDto { id: string; body: string; createdAt: string; author: { name: string }; mine: boolean; reported: boolean }

/** Plain text only: bodies are stored as typed and rendered by React as text, never as HTML. */
const toDto = (c: { id: string; body: string; createdAt: Date; status: CommentStatus; userId: string; user: { name: string } }, viewerId: string | null): CommentDto => ({
  id: c.id, body: c.body, createdAt: c.createdAt.toISOString(), author: { name: c.user.name }, mine: c.userId === viewerId, reported: c.status === "REPORTED",
});

async function liveArticleId(deps: Deps, idOrSlug: string): Promise<string> {
  const a = await deps.db.article.findFirst({ where: { ...(isUuid(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug }), ...liveWhere(deps.now()) }, select: { id: true } });
  if (!a) throw Errors.notFound("Article");
  return a.id;
}

/** Public: visible and reported-but-not-yet-actioned comments, oldest first, never hidden or deleted ones. */
export async function listComments(deps: Deps, idOrSlug: string, viewerId: string | null, q: z.infer<typeof listCommentsQuery>) {
  const articleId = await liveArticleId(deps, idOrSlug);
  const where: Prisma.CommentWhereInput = { articleId, deletedAt: null, status: { in: ["VISIBLE", "REPORTED"] } };
  const [total, rows] = await Promise.all([
    deps.db.comment.count({ where }),
    deps.db.comment.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }], ...toSkipTake(q), select: { id: true, body: true, createdAt: true, status: true, userId: true, user: { select: { name: true } } } }),
  ]);
  return { items: rows.map((r) => toDto(r, viewerId)), meta: buildPageMeta(q, total) };
}

export async function createComment(deps: Deps, ctx: AuthContext, idOrSlug: string, input: z.infer<typeof createCommentSchema>): Promise<CommentDto> {
  requirePermission(ctx, "comment:create");
  await enforceRateLimit(`comment:user:${ctx.id}`, 10, 60 * 60_000);
  const articleId = await liveArticleId(deps, idOrSlug);
  const row = await deps.db.$transaction(async (tx) => {
    const c = await tx.comment.create({ data: { articleId, userId: ctx.id, body: input.body }, select: { id: true, body: true, createdAt: true, status: true, userId: true, user: { select: { name: true } } } });
    await tx.articleEngagement.createMany({ data: [{ articleId, viewerKey: `u:${ctx.id}`, type: "COMMENT" }], skipDuplicates: true }); // real signal for trending
    return c;
  });
  return toDto(row, ctx.id);
}

/** Authors may remove their own comment; moderators any. Soft delete. Not-yours looks like not-found. */
export async function deleteComment(deps: Deps, ctx: AuthContext, id: string): Promise<{ deleted: true }> {
  if (!isUuid(id)) throw Errors.notFound("Comment");
  const c = await deps.db.comment.findFirst({ where: { id, deletedAt: null }, select: { id: true, userId: true, articleId: true } });
  const moderator = can(ctx.roles, "comment:moderate");
  if (!c || (c.userId !== ctx.id && !moderator)) throw Errors.notFound("Comment");
  await deps.db.$transaction(async (tx) => {
    const r = await tx.comment.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: deps.now() } });
    if (r.count === 1) await writeAudit(tx, { actorId: ctx.id, action: c.userId === ctx.id ? "comment.delete_own" : "comment.delete", entityType: "Comment", entityId: id, metadata: { articleId: c.articleId } });
  });
  return { deleted: true };
}

/** Any signed-in reader can flag a visible comment for review. Idempotent; the flag does not hide it by itself. */
export async function reportComment(deps: Deps, ctx: AuthContext, id: string): Promise<{ reported: true }> {
  if (!isUuid(id)) throw Errors.notFound("Comment");
  await enforceRateLimit(`comment-report:user:${ctx.id}`, 20, 60 * 60_000);
  const c = await deps.db.comment.findFirst({ where: { id, deletedAt: null, status: { in: ["VISIBLE", "REPORTED"] } }, select: { id: true, userId: true, status: true } });
  if (!c) throw Errors.notFound("Comment");
  if (c.userId === ctx.id) throw Errors.conflict("You cannot report your own comment. Delete it instead.");
  await deps.db.$transaction(async (tx) => {
    if (c.status === "VISIBLE") await tx.comment.updateMany({ where: { id, status: "VISIBLE" }, data: { status: "REPORTED" } });
    await writeAudit(tx, { actorId: ctx.id, action: "comment.report", entityType: "Comment", entityId: id });
  });
  return { reported: true };
}

/** Moderators: hide, or restore (clears a report). */
export async function moderateComment(deps: Deps, ctx: AuthContext, id: string, input: z.infer<typeof moderateSchema>): Promise<{ status: CommentStatus }> {
  requirePermission(ctx, "comment:moderate");
  if (!isUuid(id)) throw Errors.notFound("Comment");
  const c = await deps.db.comment.findFirst({ where: { id, deletedAt: null }, select: { id: true, status: true } });
  if (!c) throw Errors.notFound("Comment");
  await deps.db.$transaction(async (tx) => {
    await tx.comment.update({ where: { id }, data: { status: input.status } });
    await writeAudit(tx, { actorId: ctx.id, action: input.status === "HIDDEN" ? "comment.hide" : "comment.restore", entityType: "Comment", entityId: id, metadata: { from: c.status } });
  });
  return { status: input.status };
}

export interface ModerationItem { id: string; body: string; status: CommentStatus; createdAt: string; author: string; articleSlug: string; articleTitle: string }

/** Moderation queue. Default view: reported and hidden comments, newest first. */
export async function listForModeration(deps: Deps, ctx: Pick<AuthContext, "roles">, q: z.infer<typeof moderationQuery>) {
  requirePermission(ctx, "comment:moderate");
  const where: Prisma.CommentWhereInput = { deletedAt: null, status: q.status ?? { in: ["REPORTED", "HIDDEN"] } };
  const [total, rows] = await Promise.all([
    deps.db.comment.count({ where }),
    deps.db.comment.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], ...toSkipTake(q), select: { id: true, body: true, status: true, createdAt: true, user: { select: { name: true } }, article: { select: { slug: true, title: true } } } }),
  ]);
  const items: ModerationItem[] = rows.map((r) => ({ id: r.id, body: r.body, status: r.status, createdAt: r.createdAt.toISOString(), author: r.user.name, articleSlug: r.article.slug, articleTitle: r.article.title }));
  return { items, meta: buildPageMeta(q, total) };
}
