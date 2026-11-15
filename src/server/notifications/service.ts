import type { NotificationType, Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { buildPageMeta, paginationSchema, toSkipTake } from "@/lib/api/pagination";
import type { Deps } from "@/server/container";
import { readPrefs } from "@/server/reader/preferences";

type Db = PrismaClient | Prisma.TransactionClient;

export const listNotificationsQuery = paginationSchema.extend({ unreadOnly: z.enum(["true", "false"]).default("false") });
export const markReadSchema = z
  .object({ ids: z.array(z.string().uuid()).min(1).max(100).optional(), all: z.literal(true).optional() })
  .refine((v) => Boolean(v.ids) !== Boolean(v.all), "Provide either ids or all=true");

export interface NotificationPayload { articleId?: string; title?: string; slug?: string; reason?: string; by?: string; event?: string }

/** Creates one notification per recipient. Call inside the same transaction as the change that caused it. */
export async function notifyUsers(db: Db, userIds: string[], type: NotificationType, payload: NotificationPayload): Promise<void> {
  let recipients = [...new Set(userIds)];
  if (type !== "SECURITY_EVENT" && recipients.length) {
    // Respect each person's choice to mute editorial notifications. Security alerts are always delivered.
    const users = await db.user.findMany({ where: { id: { in: recipients } }, select: { id: true, preferences: true } });
    const muted = new Set(users.filter((u) => !readPrefs(u.preferences).editorialNotifications).map((u) => u.id));
    recipients = recipients.filter((id) => !muted.has(id));
  }
  if (!recipients.length) return;
  await db.notification.createMany({ data: recipients.map((userId) => ({ userId, type, payload: payload as Prisma.InputJsonValue })) });
}

/** Everyone who can review: active editors and administrators. */
export async function reviewerIds(db: Db, excludeUserId?: string): Promise<string[]> {
  const rows = await db.user.findMany({
    where: { deletedAt: null, roles: { some: { role: { name: { in: ["EDITOR", "ADMIN"] } } } }, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export function describeNotification(type: NotificationType, p: NotificationPayload): { title: string; href?: string } {
  const t = p.title ? `“${p.title}”` : "An article";
  switch (type) {
    case "ARTICLE_SUBMITTED": return { title: `${t} was submitted for review` };
    case "ARTICLE_APPROVED": return { title: `${t} was approved` };
    case "ARTICLE_REJECTED": return { title: `${t} was rejected${p.reason ? `: ${p.reason}` : ""}` };
    case "REVISION_REQUESTED": return { title: `Changes requested on ${t}${p.reason ? `: ${p.reason}` : ""}` };
    case "ARTICLE_PUBLISHED": return { title: `${t} is now published`, href: p.slug ? `/news/${p.slug}` : undefined };
    case "SCHEDULE_FAILED": return { title: `Scheduled publication of ${t} failed${p.reason ? `: ${p.reason}` : ""}` };
    case "SECURITY_EVENT": return { title: p.event === "password_reset" || p.event === "password_changed" ? "Your password was changed" : p.event === "other_sessions_revoked" ? "You signed out of your other devices" : "Security alert: a session was signed out after suspicious activity" };
  }
}

export async function listNotifications(deps: Deps, userId: string, q: z.infer<typeof listNotificationsQuery>) {
  const where: Prisma.NotificationWhereInput = { userId, ...(q.unreadOnly === "true" ? { readAt: null } : {}) };
  const [total, unreadCount, rows] = await Promise.all([
    deps.db.notification.count({ where }),
    deps.db.notification.count({ where: { userId, readAt: null } }),
    deps.db.notification.findMany({ where, orderBy: { createdAt: "desc" }, ...toSkipTake(q) }),
  ]);
  const items = rows.map((n) => ({
    id: n.id, type: n.type, ...describeNotification(n.type, n.payload as NotificationPayload),
    payload: n.payload, read: n.readAt !== null, createdAt: n.createdAt.toISOString(),
  }));
  return { items, meta: { ...buildPageMeta(q, total), unreadCount } };
}

/** Only ever touches the caller's own notifications. Unknown or foreign ids are silently ignored. */
export async function markNotificationsRead(deps: Deps, userId: string, input: z.infer<typeof markReadSchema>): Promise<{ updated: number }> {
  const res = await deps.db.notification.updateMany({
    where: { userId, readAt: null, ...(input.ids ? { id: { in: input.ids } } : {}) },
    data: { readAt: deps.now() },
  });
  return { updated: res.count };
}
