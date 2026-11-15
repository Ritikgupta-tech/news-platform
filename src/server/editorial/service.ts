import type { ArticleStatus, NotificationType, ReviewDecision } from "@prisma/client";
import { z } from "zod";
import { ApiError, Errors } from "@/lib/api/errors";
import { can } from "@/lib/permissions";
import { zonedLocalToUtc } from "@/lib/timezone";
import { assertTransition, assertVersion } from "@/lib/workflow";
import { canViewUnpublished } from "@/server/articles/policy";
import { fetchArticleDto, type ArticleDto } from "@/server/articles/service";
import { writeAudit } from "@/server/audit/audit";
import type { AuthContext } from "@/server/auth/guard";
import type { Deps } from "@/server/container";
import { notifyUsers, reviewerIds } from "@/server/notifications/service";
import { actionSchemas, type EditorialAction } from "./validation";

interface Rule { from: ArticleStatus[]; to: ArticleStatus }

/** Which statuses each action may start from. The role rules live in lib/workflow.ts (single source of truth). */
const RULES: Record<EditorialAction, Rule> = {
  submit: { from: ["DRAFT", "CHANGES_REQUESTED"], to: "SUBMITTED" },
  "start-review": { from: ["SUBMITTED"], to: "IN_REVIEW" },
  "request-changes": { from: ["IN_REVIEW"], to: "CHANGES_REQUESTED" },
  approve: { from: ["IN_REVIEW"], to: "APPROVED" },
  reject: { from: ["IN_REVIEW"], to: "ARCHIVED" },
  publish: { from: ["APPROVED", "SCHEDULED", "DRAFT"], to: "PUBLISHED" }, // DRAFT only with the direct-publish grant
  schedule: { from: ["APPROVED"], to: "SCHEDULED" },
  "cancel-schedule": { from: ["SCHEDULED"], to: "APPROVED" },
  archive: { from: ["PUBLISHED"], to: "ARCHIVED" },
};

const MIN_LEAD_MS = 60_000;
const MAX_LEAD_MS = 365 * 24 * 3600_000;

type Input = Record<string, unknown> & { version: number };

function resolveScheduleTime(input: z.infer<typeof actionSchemas.schedule>, now: Date): Date {
  let when: Date;
  if (input.scheduledFor) when = new Date(input.scheduledFor);
  else {
    try {
      when = zonedLocalToUtc(input.localDateTime!, input.timezone!);
    } catch (e) {
      throw new ApiError(422, "VALIDATION_ERROR", (e as Error).message, [{ path: "localDateTime", message: (e as Error).message }]);
    }
  }
  const lead = when.getTime() - now.getTime();
  if (lead < MIN_LEAD_MS) throw new ApiError(422, "VALIDATION_ERROR", "Choose a time at least one minute in the future", [{ path: "scheduledFor", message: "Must be in the future" }]);
  if (lead > MAX_LEAD_MS) throw new ApiError(422, "VALIDATION_ERROR", "Scheduling is limited to one year ahead", [{ path: "scheduledFor", message: "Too far ahead" }]);
  return when;
}

function assertPermission(ctx: AuthContext, action: EditorialAction, a: { authorId: string; status: ArticleStatus }) {
  const owner = a.authorId === ctx.id;
  const forbidden = (msg?: string) => (msg ? new ApiError(403, "FORBIDDEN", msg) : Errors.forbidden());
  switch (action) {
    case "submit":
      if (!((owner && can(ctx.roles, "article:submit")) || can(ctx.roles, "article:edit_any"))) throw forbidden();
      return;
    case "start-review":
    case "request-changes":
    case "approve":
    case "reject":
      if (!can(ctx.roles, "article:review")) throw forbidden();
      // Separation of duties: nobody (except an administrator) reviews their own article.
      if (owner && !ctx.roles.includes("ADMIN")) throw forbidden("You cannot review your own article");
      return;
    case "publish":
      if (!(can(ctx.roles, "article:publish") || (ctx.canPublishDirectly && owner && a.status === "DRAFT"))) throw forbidden();
      return;
    case "schedule":
    case "cancel-schedule":
      if (!can(ctx.roles, "article:publish")) throw forbidden();
      return;
    case "archive":
      if (!can(ctx.roles, "article:archive")) throw forbidden();
  }
}

/**
 * Applies one editorial action. Order of checks: visibility (404) -> permission (403) -> allowed transition (422)
 * -> version (409) -> preconditions (422) -> atomic compare-and-set on (status, version).
 */
export async function applyAction(deps: Deps, ctx: AuthContext, id: string, action: EditorialAction, rawInput: unknown): Promise<ArticleDto> {
  const input = actionSchemas[action].parse(rawInput) as Input;
  const article = await deps.db.article.findFirst({
    where: { id, deletedAt: null },
    select: { authorId: true, status: true, version: true, title: true, slug: true, publishedAt: true, category: { select: { isActive: true } } },
  });
  if (!article || !canViewUnpublished(ctx, article)) throw Errors.notFound("Article");

  assertPermission(ctx, action, article);
  const rule = RULES[action];
  if (!rule.from.includes(article.status)) throw Errors.invalidTransition(article.status, rule.to);
  assertTransition(article.status, rule.to, ctx);
  assertVersion(article.version, input.version);

  if ((action === "publish" || action === "schedule" || action === "approve") && !article.category.isActive) {
    throw new ApiError(422, "VALIDATION_ERROR", "The article's category is inactive. Choose an active category first.", [{ path: "categoryId", message: "Inactive category" }]);
  }

  const now = deps.now();
  const data: { status: ArticleStatus; publishedAt?: Date; scheduledFor?: Date | null } = { status: rule.to };
  if (action === "publish") Object.assign(data, { publishedAt: now, scheduledFor: null });
  if (action === "schedule") data.scheduledFor = resolveScheduleTime(input as z.infer<typeof actionSchemas.schedule>, now);
  if (action === "cancel-schedule") data.scheduledFor = null;

  await deps.db.$transaction(async (tx) => {
    const res = await tx.article.updateMany({ where: { id, status: article.status, version: input.version, deletedAt: null }, data });
    if (res.count !== 1) {
      const current = await tx.article.findUnique({ where: { id }, select: { version: true, status: true } });
      if (current && current.version !== input.version) throw Errors.versionConflict(current.version);
      throw Errors.conflict(`The article changed state (now ${current?.status ?? "deleted"}). Reload and try again.`);
    }

    const reason = typeof input["reason"] === "string" ? (input["reason"] as string) : undefined;
    const note = typeof input["note"] === "string" ? (input["note"] as string) : undefined;
    const decision: ReviewDecision | null = action === "approve" ? "APPROVED" : action === "request-changes" ? "CHANGES_REQUESTED" : action === "reject" ? "REJECTED" : null;
    if (decision) await tx.editorialReview.create({ data: { articleId: id, reviewerId: ctx.id, decision, reason: reason ?? note ?? null } });

    const payload = { articleId: id, title: article.title, slug: article.slug, by: ctx.name, ...(reason ? { reason } : {}) };
    const notify = async (type: NotificationType, to: string[]) => notifyUsers(tx, to.filter((u) => u !== ctx.id), type, payload);
    if (action === "submit") await notify("ARTICLE_SUBMITTED", await reviewerIds(tx, ctx.id));
    if (action === "request-changes") await notify("REVISION_REQUESTED", [article.authorId]);
    if (action === "approve") await notify("ARTICLE_APPROVED", [article.authorId]);
    if (action === "reject") await notify("ARTICLE_REJECTED", [article.authorId]);
    if (action === "publish") await notify("ARTICLE_PUBLISHED", [article.authorId]);

    await writeAudit(tx, {
      actorId: ctx.id, action: `article.${action}`, entityType: "Article", entityId: id,
      metadata: { from: article.status, to: rule.to, version: input.version, ...(data.scheduledFor ? { scheduledFor: data.scheduledFor.toISOString() } : {}) },
    });
  });
  return fetchArticleDto(deps.db, id);
}

export async function listRevisions(deps: Deps, ctx: AuthContext, id: string) {
  const a = await deps.db.article.findFirst({ where: { id, deletedAt: null }, select: { authorId: true, status: true } });
  if (!a || !canViewUnpublished(ctx, a)) throw Errors.notFound("Article");
  const rows = await deps.db.articleRevision.findMany({ where: { articleId: id }, orderBy: { version: "desc" }, include: { editedBy: { select: { id: true, name: true } } } });
  return rows.map((r) => ({
    version: r.version, title: r.title, summary: r.summary, bodyHtml: r.bodyHtml, changeNote: r.changeNote,
    editedBy: r.editedBy, createdAt: r.createdAt.toISOString(),
  }));
}

export async function listReviews(deps: Deps, ctx: AuthContext, id: string) {
  const a = await deps.db.article.findFirst({ where: { id, deletedAt: null }, select: { authorId: true, status: true } });
  if (!a || !canViewUnpublished(ctx, a)) throw Errors.notFound("Article");
  const rows = await deps.db.editorialReview.findMany({ where: { articleId: id }, orderBy: { createdAt: "desc" }, include: { reviewer: { select: { id: true, name: true } } } });
  return rows.map((r) => ({ id: r.id, decision: r.decision, reason: r.reason, reviewer: r.reviewer, createdAt: r.createdAt.toISOString() }));
}
