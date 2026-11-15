import { CampaignStatus, DeliveryStatus, SubscriberStatus } from "@prisma/client";
import { writeAudit } from "@/server/audit/audit";
import type { Deps } from "@/server/container";
import { MailError, type SendResult } from "@/server/mail/mailer";
import { deliveryCounts } from "./campaigns";
import { renderCampaignEmail } from "./render";
import { makeUnsubscribeToken } from "./tokens";

export const MAX_ATTEMPTS = 3;
export const STALE_CLAIM_MS = 10 * 60_000;
export const BREAKER_LIMIT = 5;

export interface CampaignRunReport { id: string; sent: number; failed: number; skipped: number; completed: boolean }
export interface SendRunResult { campaigns: CampaignRunReport[]; aborted?: string }
export interface SendOptions { maxMs?: number; batch?: number; concurrency?: number }

type Outcome = "sent" | "failed" | "skipped" | "retry" | "config";
interface Result { outcome: Outcome; message?: string; quiet?: boolean }
const clip = (s: string) => s.slice(0, 300);

/**
 * Sends every campaign that is due. Safe to run every minute and from several workers at once:
 *  - a campaign is claimed with an atomic status change; its recipients are frozen once into NewsletterDelivery rows
 *    (unique per campaign + subscriber, so nobody can receive it twice);
 *  - each delivery is claimed atomically before the provider is called;
 *  - a delivery left "in flight" by a crashed worker is marked FAILED ("outcome unknown") instead of being sent again,
 *    because a duplicate e-mail is worse than a missed one;
 *  - consent is re-checked per recipient at send time: anyone who unsubscribed since the freeze is skipped.
 * It stops when time runs out (the next run continues) or after BREAKER_LIMIT consecutive failures, which usually means a provider or settings problem.
 */
export async function sendDueCampaigns(deps: Deps, opts: SendOptions = {}): Promise<SendRunResult> {
  if (deps.env.NODE_ENV === "production" && deps.mailer.real === false) {
    return { campaigns: [], aborted: "No mail provider is configured (set MAIL_PROVIDER); nothing was sent." };
  }
  const deadline = Date.now() + (opts.maxMs ?? 45_000);
  const due = await deps.db.newsletterCampaign.findMany({
    where: { OR: [{ status: CampaignStatus.SENDING }, { status: CampaignStatus.SCHEDULED, scheduledAt: { lte: deps.now() } }] },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    take: 5,
    select: { id: true },
  });
  const result: SendRunResult = { campaigns: [] };
  for (const { id } of due) {
    if (result.aborted || Date.now() >= deadline) break;
    const r = await runCampaign(deps, id, deadline, opts);
    if (r.report) result.campaigns.push(r.report);
    if (r.aborted) result.aborted = r.aborted;
  }
  return result;
}

async function freezeRecipients(deps: Deps, campaignId: string): Promise<void> {
  let after = "";
  for (;;) {
    const subs = await deps.db.newsletterSubscriber.findMany({ where: { status: SubscriberStatus.ACTIVE, ...(after ? { id: { gt: after } } : {}) }, orderBy: { id: "asc" }, take: 1000, select: { id: true } });
    if (!subs.length) break;
    await deps.db.newsletterDelivery.createMany({ data: subs.map((s) => ({ campaignId, subscriberId: s.id })), skipDuplicates: true });
    after = subs[subs.length - 1]!.id;
  }
  await deps.db.newsletterCampaign.update({ where: { id: campaignId }, data: { recipientsAt: deps.now() } });
}

async function runCampaign(deps: Deps, id: string, deadline: number, opts: SendOptions): Promise<{ report?: CampaignRunReport; aborted?: string }> {
  const now = deps.now();
  await deps.db.newsletterCampaign.updateMany({ where: { id, status: CampaignStatus.SCHEDULED, scheduledAt: { lte: now } }, data: { status: CampaignStatus.SENDING, startedAt: now } });
  const campaign = await deps.db.newsletterCampaign.findUnique({ where: { id } });
  if (!campaign || campaign.status !== CampaignStatus.SENDING) return {}; // another worker finished or cancelled it
  if (!campaign.recipientsAt) await freezeRecipients(deps, id);

  await deps.db.newsletterDelivery.updateMany({
    where: { campaignId: id, status: DeliveryStatus.SENDING, claimedAt: { lt: new Date(now.getTime() - STALE_CLAIM_MS) } },
    data: { status: DeliveryStatus.FAILED, lastError: "Outcome unknown: the worker stopped while sending. Not retried to avoid a duplicate e-mail." },
  });

  const batch = opts.batch ?? 50;
  const concurrency = opts.concurrency ?? 5;
  const report: CampaignRunReport = { id, sent: 0, failed: 0, skipped: 0, completed: false };
  const deferred = new Set<string>();
  const siteName = process.env.NEXT_PUBLIC_SITE_NAME ?? "E News";
  let streak = 0;
  let aborted: string | undefined;
  let lastError = "";

  while (!aborted && Date.now() < deadline) {
    const live = await deps.db.newsletterCampaign.findUnique({ where: { id }, select: { status: true } });
    if (live?.status !== CampaignStatus.SENDING) break; // cancelled while we were working
    const rows = await deps.db.newsletterDelivery.findMany({
      where: { campaignId: id, status: DeliveryStatus.PENDING, ...(deferred.size ? { id: { notIn: [...deferred] } } : {}) },
      orderBy: { id: "asc" }, take: batch, include: { subscriber: { select: { id: true, email: true, status: true } } },
    });
    if (!rows.length) break;

    for (let i = 0; i < rows.length && !aborted; i += concurrency) {
      const outcomes = await Promise.all(rows.slice(i, i + concurrency).map(async (row): Promise<Result> => {
        const claimed = await deps.db.newsletterDelivery.updateMany({ where: { id: row.id, status: DeliveryStatus.PENDING }, data: { status: DeliveryStatus.SENDING, claimedAt: deps.now(), attempts: { increment: 1 } } });
        if (claimed.count !== 1) return { outcome: "skipped", quiet: true };
        if (row.subscriber.status !== SubscriberStatus.ACTIVE) {
          await deps.db.newsletterDelivery.update({ where: { id: row.id }, data: { status: DeliveryStatus.SKIPPED, lastError: "No longer subscribed" } });
          return { outcome: "skipped" };
        }
        const token = makeUnsubscribeToken(deps, row.subscriber.id);
        const mail = renderCampaignEmail({
          subject: campaign.subject, bodyText: campaign.bodyText, siteName,
          unsubscribePageUrl: `${deps.env.APP_URL}/newsletter/unsubscribe?token=${token}`,
          unsubscribeOneClickUrl: `${deps.env.APP_URL}/api/v1/newsletter/one-click?token=${token}`,
        });
        try {
          const sent = await deps.mailer.send({ to: row.subscriber.email, subject: mail.subject, text: mail.text, html: mail.html, headers: mail.headers });
          await deps.db.newsletterDelivery.update({ where: { id: row.id }, data: { status: DeliveryStatus.SENT, sentAt: deps.now(), lastError: null, providerMessageId: (sent as SendResult | undefined)?.messageId ?? null } });
          return { outcome: "sent" };
        } catch (e) {
          const kind = e instanceof MailError ? e.kind : "transient";
          const message = clip(e instanceof Error ? e.message : "Send failed");
          if (kind === "config") {
            await deps.db.newsletterDelivery.update({ where: { id: row.id }, data: { status: DeliveryStatus.PENDING, attempts: { decrement: 1 }, lastError: message } });
            return { outcome: "config", message };
          }
          if (kind === "transient" && row.attempts + 1 < MAX_ATTEMPTS) {
            await deps.db.newsletterDelivery.update({ where: { id: row.id }, data: { status: DeliveryStatus.PENDING, lastError: message } });
            deferred.add(row.id);
            return { outcome: "retry", message };
          }
          await deps.db.newsletterDelivery.update({ where: { id: row.id }, data: { status: DeliveryStatus.FAILED, lastError: message } });
          return { outcome: "failed", message };
        }
      }));
      for (const o of outcomes) {
        if (o.outcome === "sent") { report.sent++; streak = 0; }
        else if (o.outcome === "skipped") { if (!o.quiet) report.skipped++; }
        else {
          if (o.outcome === "failed") report.failed++;
          streak++;
          lastError = o.message ?? lastError;
          if (o.outcome === "config") aborted = `Mail settings problem: ${lastError}`;
        }
      }
      if (!aborted && streak >= BREAKER_LIMIT) aborted = `Stopped after ${BREAKER_LIMIT} failures in a row (last: ${lastError}). Remaining mails stay queued and are retried on the next run.`;
    }
  }

  if (!aborted) {
    const open = await deps.db.newsletterDelivery.count({ where: { campaignId: id, status: { in: [DeliveryStatus.PENDING, DeliveryStatus.SENDING] } } });
    if (open === 0) {
      const counts = (await deliveryCounts(deps, [id])).get(id);
      const done = await deps.db.newsletterCampaign.updateMany({ where: { id, status: CampaignStatus.SENDING }, data: { status: CampaignStatus.SENT, sentAt: deps.now(), stats: counts ? { ...counts } : undefined } });
      if (done.count === 1) {
        report.completed = true;
        await writeAudit(deps.db, { actorId: null, action: "newsletter.campaign.sent", entityType: "NewsletterCampaign", entityId: id, metadata: counts ? { ...counts } : undefined });
      }
    }
  }
  return { report, aborted };
}
