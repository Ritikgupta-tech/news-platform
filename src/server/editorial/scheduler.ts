import type { Deps } from "@/server/container";
import { writeAudit } from "@/server/audit/audit";
import { notifyUsers, reviewerIds } from "@/server/notifications/service";

export interface PublishDueResult { published: string[]; skipped: string[]; failed: { id: string; reason: string }[] }
export interface PublishDueOptions { limit?: number; maxAttempts?: number; backoffMs?: number }

class Blocked extends Error {}

type Outcome = "published" | "skipped";

async function publishOne(deps: Deps, id: string): Promise<Outcome> {
  return deps.db.$transaction(async (tx) => {
    // Row lock: concurrent workers skip rows another worker is already handling.
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id::text AS id FROM "Article" WHERE id = ${id}::uuid FOR UPDATE SKIP LOCKED`;
    if (!locked.length) return "skipped";
    const a = await tx.article.findUnique({ where: { id }, include: { category: { select: { isActive: true } } } });
    const now = deps.now();
    // Idempotent: anything no longer scheduled-and-due (already published, cancelled, rescheduled, deleted) is left alone.
    if (!a || a.deletedAt || a.status !== "SCHEDULED" || !a.scheduledFor || a.scheduledFor > now) return "skipped";
    if (!a.category.isActive) throw new Blocked("the category is inactive");

    await tx.article.update({ where: { id }, data: { status: "PUBLISHED", publishedAt: a.scheduledFor, scheduledFor: null } });
    await notifyUsers(tx, [a.authorId], "ARTICLE_PUBLISHED", { articleId: id, title: a.title, slug: a.slug });
    await writeAudit(tx, { actorId: null, action: "article.publish.scheduled", entityType: "Article", entityId: id, metadata: { publishedAt: a.scheduledFor.toISOString() } });
    return "published";
  });
}

/** Puts a failed article back to APPROVED (so it cannot loop forever) and tells the author and the editors. */
async function recordFailure(deps: Deps, id: string, reason: string): Promise<void> {
  await deps.db.$transaction(async (tx) => {
    const a = await tx.article.findUnique({ where: { id }, select: { authorId: true, title: true, slug: true, status: true } });
    if (!a || a.status !== "SCHEDULED") return;
    await tx.article.updateMany({ where: { id, status: "SCHEDULED" }, data: { status: "APPROVED", scheduledFor: null } });
    await notifyUsers(tx, [a.authorId, ...(await reviewerIds(tx))], "SCHEDULE_FAILED", { articleId: id, title: a.title, slug: a.slug, reason });
    await writeAudit(tx, { actorId: null, action: "article.publish.scheduled_failed", entityType: "Article", entityId: id, metadata: { reason } });
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Publishes every scheduled article whose time has come. Safe to run on any schedule, from several workers at once,
 * and repeatedly: each article is published at most once. Transient database errors are retried with backoff;
 * a permanent problem (e.g. inactive category) moves the article back to APPROVED and raises SCHEDULE_FAILED.
 */
export async function publishDueArticles(deps: Deps, opts: PublishDueOptions = {}): Promise<PublishDueResult> {
  const { limit = 50, maxAttempts = 3, backoffMs = 100 } = opts;
  const due = await deps.db.article.findMany({
    where: { status: "SCHEDULED", scheduledFor: { lte: deps.now() }, deletedAt: null },
    orderBy: { scheduledFor: "asc" }, take: limit, select: { id: true },
  });
  const result: PublishDueResult = { published: [], skipped: [], failed: [] };
  for (const { id } of due) {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        (await publishOne(deps, id)) === "published" ? result.published.push(id) : result.skipped.push(id);
        lastError = undefined;
        break;
      } catch (e) {
        lastError = e;
        if (e instanceof Blocked) break; // permanent: do not retry
        if (attempt < maxAttempts) await sleep(backoffMs * attempt);
      }
    }
    if (lastError !== undefined) {
      const reason = lastError instanceof Blocked ? lastError.message : "an unexpected error occurred";
      if (!(lastError instanceof Blocked)) console.error(`[scheduler] publishing ${id} failed after ${maxAttempts} attempts`, lastError);
      try {
        await recordFailure(deps, id, reason);
      } catch (e) {
        console.error(`[scheduler] could not record failure for ${id}`, e);
      }
      result.failed.push({ id, reason });
    }
  }
  return result;
}
