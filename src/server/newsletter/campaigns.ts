import { CampaignStatus, DeliveryStatus, type NewsletterCampaign } from "@prisma/client";
import { z } from "zod";
import { ApiError, Errors } from "@/lib/api/errors";
import { buildPageMeta, paginationSchema, toSkipTake } from "@/lib/api/pagination";
import { writeAudit } from "@/server/audit/audit";
import { requirePermission, type AuthContext } from "@/server/auth/guard";
import type { Deps } from "@/server/container";
import { MailError } from "@/server/mail/mailer";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { renderCampaignEmail, textToHtml } from "./render";

const singleLine = (s: string) => !/[\u0000-\u001f\u007f]/.test(s);
export const campaignInput = z.object({
  subject: z.string().trim().min(3, "Subject needs at least 3 characters").max(150).refine(singleLine, "Subject must be a single line"),
  body: z.string().min(20, "Write at least a couple of sentences").max(20_000),
});
export const updateCampaignInput = campaignInput.extend({ version: z.number().int().min(1) });
export const scheduleInput = z.object({ scheduledAt: z.string().datetime().nullish() });
export const listCampaignsQuery = paginationSchema.extend({ status: z.nativeEnum(CampaignStatus).optional() });

export interface DeliveryCounts { pending: number; sending: number; sent: number; failed: number; skipped: number; total: number }
export interface CampaignDto {
  id: string; subject: string; bodyText: string; status: CampaignStatus; version: number;
  scheduledAt: string | null; startedAt: string | null; sentAt: string | null; createdAt: string; counts: DeliveryCounts;
}

const emptyCounts = (): DeliveryCounts => ({ pending: 0, sending: 0, sent: 0, failed: 0, skipped: 0, total: 0 });

export async function deliveryCounts(deps: Deps, ids: string[]): Promise<Map<string, DeliveryCounts>> {
  const out = new Map<string, DeliveryCounts>(ids.map((id) => [id, emptyCounts()]));
  if (!ids.length) return out;
  const rows = await deps.db.newsletterDelivery.groupBy({ by: ["campaignId", "status"], where: { campaignId: { in: ids } }, _count: { _all: true } });
  for (const r of rows) {
    const c = out.get(r.campaignId);
    if (!c) continue;
    const n = r._count._all;
    c[r.status.toLowerCase() as "pending" | "sending" | "sent" | "failed" | "skipped"] = n;
    c.total += n;
  }
  return out;
}

const toDto = (c: NewsletterCampaign, counts: DeliveryCounts): CampaignDto => ({
  id: c.id, subject: c.subject, bodyText: c.bodyText, status: c.status, version: c.version,
  scheduledAt: c.scheduledAt?.toISOString() ?? null, startedAt: c.startedAt?.toISOString() ?? null, sentAt: c.sentAt?.toISOString() ?? null,
  createdAt: c.createdAt.toISOString(), counts,
});

const wrongState = (c: { status: CampaignStatus }, verb: string) => new ApiError(422, "INVALID_TRANSITION", `A campaign that is ${c.status.toLowerCase()} cannot be ${verb}`);

async function loadOr404(deps: Deps, id: string): Promise<NewsletterCampaign> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw Errors.notFound("Campaign");
  const c = await deps.db.newsletterCampaign.findUnique({ where: { id } });
  if (!c) throw Errors.notFound("Campaign");
  return c;
}

export async function createCampaign(deps: Deps, ctx: AuthContext, input: z.infer<typeof campaignInput>): Promise<CampaignDto> {
  requirePermission(ctx, "newsletter:manage");
  const c = await deps.db.$transaction(async (tx) => {
    const row = await tx.newsletterCampaign.create({ data: { subject: input.subject, bodyText: input.body, bodyHtml: textToHtml(input.body), createdById: ctx.id } });
    await writeAudit(tx, { actorId: ctx.id, action: "newsletter.campaign.create", entityType: "NewsletterCampaign", entityId: row.id });
    return row;
  });
  return toDto(c, emptyCounts());
}

export async function updateCampaign(deps: Deps, ctx: AuthContext, id: string, input: z.infer<typeof updateCampaignInput>): Promise<CampaignDto> {
  requirePermission(ctx, "newsletter:manage");
  const r = await deps.db.newsletterCampaign.updateMany({
    where: { id, version: input.version, status: CampaignStatus.DRAFT },
    data: { subject: input.subject, bodyText: input.body, bodyHtml: textToHtml(input.body), version: { increment: 1 } },
  });
  const c = await loadOr404(deps, id);
  if (r.count === 0) {
    if (c.status !== CampaignStatus.DRAFT) throw wrongState(c, "edited (only drafts can be edited)");
    throw Errors.versionConflict(c.version);
  }
  await writeAudit(deps.db, { actorId: ctx.id, action: "newsletter.campaign.update", entityType: "NewsletterCampaign", entityId: id });
  return toDto(c, emptyCounts());
}

export async function listCampaigns(deps: Deps, ctx: Pick<AuthContext, "roles">, q: z.infer<typeof listCampaignsQuery>) {
  requirePermission(ctx, "newsletter:manage");
  const where = q.status ? { status: q.status } : {};
  const [total, rows] = await Promise.all([
    deps.db.newsletterCampaign.count({ where }),
    deps.db.newsletterCampaign.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], ...toSkipTake(q) }),
  ]);
  const counts = await deliveryCounts(deps, rows.map((r) => r.id));
  return { items: rows.map((r) => toDto(r, counts.get(r.id) ?? emptyCounts())), meta: buildPageMeta(q, total) };
}

export interface CampaignDetailDto extends CampaignDto { failures: { id: string; email: string; error: string | null; attempts: number }[]; activeSubscribers: number }

export async function getCampaign(deps: Deps, ctx: Pick<AuthContext, "roles">, id: string): Promise<CampaignDetailDto> {
  requirePermission(ctx, "newsletter:manage");
  const c = await loadOr404(deps, id);
  const [counts, failed, active] = await Promise.all([
    deliveryCounts(deps, [id]),
    deps.db.newsletterDelivery.findMany({ where: { campaignId: id, status: DeliveryStatus.FAILED }, orderBy: { id: "asc" }, take: 20, include: { subscriber: { select: { email: true } } } }),
    deps.db.newsletterSubscriber.count({ where: { status: "ACTIVE" } }),
  ]);
  return { ...toDto(c, counts.get(id) ?? emptyCounts()), activeSubscribers: active, failures: failed.map((f) => ({ id: f.id, email: f.subscriber.email, error: f.lastError, attempts: f.attempts })) };
}

/** DRAFT -> SCHEDULED. No `scheduledAt` means "as soon as the next send job runs". */
export async function scheduleCampaign(deps: Deps, ctx: AuthContext, id: string, input: z.infer<typeof scheduleInput>): Promise<CampaignDto> {
  requirePermission(ctx, "newsletter:manage");
  const now = deps.now();
  const when = input.scheduledAt ? new Date(input.scheduledAt) : now;
  if (input.scheduledAt && when.getTime() < now.getTime() - 5 * 60_000) throw new ApiError(422, "VALIDATION_ERROR", "The send time is in the past.");
  if (when.getTime() > now.getTime() + 365 * 86_400_000) throw new ApiError(422, "VALIDATION_ERROR", "Schedule at most one year ahead.");
  const r = await deps.db.newsletterCampaign.updateMany({ where: { id, status: CampaignStatus.DRAFT }, data: { status: CampaignStatus.SCHEDULED, scheduledAt: when, version: { increment: 1 } } });
  const c = await loadOr404(deps, id);
  if (r.count === 0) throw wrongState(c, "scheduled");
  await writeAudit(deps.db, { actorId: ctx.id, action: "newsletter.campaign.schedule", entityType: "NewsletterCampaign", entityId: id, metadata: { scheduledAt: when.toISOString() } });
  return toDto(c, emptyCounts());
}

/**
 * SCHEDULED -> DRAFT (changed your mind before it started), or SENDING -> CANCELLED (stop now: everything not yet sent is skipped;
 * mails already handed to the provider cannot be recalled).
 */
export async function cancelCampaign(deps: Deps, ctx: AuthContext, id: string): Promise<CampaignDto> {
  requirePermission(ctx, "newsletter:manage");
  const result = await deps.db.$transaction(async (tx) => {
    const back = await tx.newsletterCampaign.updateMany({ where: { id, status: CampaignStatus.SCHEDULED }, data: { status: CampaignStatus.DRAFT, scheduledAt: null, version: { increment: 1 } } });
    if (back.count === 1) return "unscheduled" as const;
    const stop = await tx.newsletterCampaign.updateMany({ where: { id, status: CampaignStatus.SENDING }, data: { status: CampaignStatus.CANCELLED, version: { increment: 1 } } });
    if (stop.count === 1) {
      await tx.newsletterDelivery.updateMany({ where: { campaignId: id, status: DeliveryStatus.PENDING }, data: { status: DeliveryStatus.SKIPPED, lastError: "Campaign cancelled" } });
      return "cancelled" as const;
    }
    return null;
  });
  const c = await loadOr404(deps, id);
  if (!result) throw wrongState(c, "cancelled");
  await writeAudit(deps.db, { actorId: ctx.id, action: `newsletter.campaign.${result === "cancelled" ? "cancel" : "unschedule"}`, entityType: "NewsletterCampaign", entityId: id });
  return toDto(c, (await deliveryCounts(deps, [id])).get(id) ?? emptyCounts());
}

/** Sends the draft to the caller's own address only (never to a typed-in address), without an unsubscribe link. 10 per hour. */
export async function sendTestCampaign(deps: Deps, ctx: AuthContext, id: string): Promise<{ sentTo: string }> {
  requirePermission(ctx, "newsletter:manage");
  await enforceRateLimit(`nl:test:${ctx.id}`, 10, 60 * 60_000);
  const c = await loadOr404(deps, id);
  const mail = renderCampaignEmail({ subject: `[Test] ${c.subject}`, bodyText: c.bodyText, siteName: process.env.NEXT_PUBLIC_SITE_NAME ?? "E News" });
  try {
    await deps.mailer.send({ to: ctx.email, subject: mail.subject, text: mail.text, html: mail.html });
  } catch (e) {
    console.error("[newsletter] test send failed", e);
    throw new ApiError(503, "INTERNAL_ERROR", e instanceof MailError ? `The test email could not be sent: ${e.message}.` : "The test email could not be sent.");
  }
  return { sentTo: ctx.email };
}
