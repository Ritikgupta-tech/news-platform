import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError, Errors } from "@/lib/api/errors";
import { writeAudit } from "@/server/audit/audit";
import { burnVerify, hashPassword, passwordSchema, verifyPassword } from "@/server/auth/password";
import type { AuthContext } from "@/server/auth/guard";
import { getUserDto, type AuthUserDto } from "@/server/auth/service";
import { isValidTimeZone } from "@/lib/timezone";
import type { Deps } from "@/server/container";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { readPrefs } from "@/server/reader/preferences";

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80).optional(),
  timezone: z.string().max(64).refine(isValidTimeZone, "Unknown timezone").optional(),
}).refine((v) => v.name !== undefined || v.timezone !== undefined, "Nothing to update");

export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema });
export const deleteAccountSchema = z.object({ password: z.string().min(1).max(128), confirm: z.literal("DELETE", { errorMap: () => ({ message: "Type DELETE to confirm" }) }) });

const field = (path: string, message: string) => new ApiError(422, "VALIDATION_ERROR", message, [{ path, message }]);

export async function updateProfile(deps: Deps, userId: string, input: z.infer<typeof updateProfileSchema>): Promise<AuthUserDto> {
  await deps.db.user.update({ where: { id: userId }, data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.timezone !== undefined ? { timezone: input.timezone } : {}) } });
  return getUserDto(deps, userId);
}

/** Verifies the current password (rate limited), sets the new one and signs out every OTHER device. */
export async function changePassword(deps: Deps, ctx: AuthContext, input: z.infer<typeof changePasswordSchema>): Promise<{ otherSessionsRevoked: number }> {
  await enforceRateLimit(`pwchange:${ctx.id}`, 5, 15 * 60_000);
  const user = await deps.db.user.findFirstOrThrow({ where: { id: ctx.id, deletedAt: null }, select: { passwordHash: true, email: true, name: true } });
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) throw field("currentPassword", "Current password is incorrect");
  if (input.currentPassword === input.newPassword) throw field("newPassword", "Choose a password different from the current one");
  const passwordHash = await hashPassword(input.newPassword);
  const now = deps.now();
  const revoked = await deps.db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: ctx.id }, data: { passwordHash } });
    const r = await tx.session.updateMany({ where: { userId: ctx.id, revokedAt: null, id: { not: ctx.sessionId } }, data: { revokedAt: now } });
    await tx.notification.create({ data: { userId: ctx.id, type: "SECURITY_EVENT", payload: { event: "password_changed" } } });
    await writeAudit(tx, { actorId: ctx.id, action: "account.password_change", entityType: "User", entityId: ctx.id, metadata: { otherSessionsRevoked: r.count } });
    return r.count;
  });
  try {
    await deps.mailer.send({ to: user.email, subject: "Your password was changed", text: "Your password was just changed and your other devices were signed out. If this wasn't you, reset your password immediately." });
  } catch (e) { console.error("[account] password change email failed", e); }
  return { otherSessionsRevoked: revoked };
}

export async function revokeOtherSessions(deps: Deps, ctx: AuthContext): Promise<{ revoked: number }> {
  const r = await deps.db.$transaction(async (tx) => {
    const res = await tx.session.updateMany({ where: { userId: ctx.id, revokedAt: null, id: { not: ctx.sessionId } }, data: { revokedAt: deps.now() } });
    await tx.notification.create({ data: { userId: ctx.id, type: "SECURITY_EVENT", payload: { event: "other_sessions_revoked" } } });
    await writeAudit(tx, { actorId: ctx.id, action: "account.sessions_revoke_others", entityType: "User", entityId: ctx.id, metadata: { revoked: res.count } });
    return res.count;
  });
  return { revoked: r };
}

/** Everything we hold about the person, as plain JSON. Never includes password or token hashes. */
export async function exportData(deps: Deps, userId: string) {
  await enforceRateLimit(`export:${userId}`, 3, 60 * 60_000);
  const u = await deps.db.user.findFirstOrThrow({
    where: { id: userId, deletedAt: null },
    include: {
      roles: { include: { role: true } }, interests: { select: { slug: true, name: true } },
      bookmarks: { orderBy: { createdAt: "desc" }, include: { article: { select: { slug: true, title: true } } } },
      history: { orderBy: { lastReadAt: "desc" }, include: { article: { select: { slug: true, title: true } } } },
      notifications: { orderBy: { createdAt: "desc" } },
      searchHistory: { orderBy: { createdAt: "desc" } },
      comments: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, select: { body: true, createdAt: true, article: { select: { slug: true } } } },
      articles: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, slug: true, title: true, status: true, createdAt: true, publishedAt: true }, },
      authorProfile: { select: { slug: true, bio: true } },
    },
  });
  return {
    exportedAt: deps.now().toISOString(),
    profile: { id: u.id, email: u.email, name: u.name, timezone: u.timezone, createdAt: u.createdAt.toISOString(), emailVerified: u.emailVerifiedAt !== null, roles: u.roles.map((r) => r.role.name), authorProfile: u.authorProfile },
    preferences: readPrefs(u.preferences),
    interests: u.interests,
    bookmarks: u.bookmarks.map((b) => ({ article: b.article.slug, title: b.article.title, savedAt: b.createdAt.toISOString() })),
    readingHistory: u.history.map((h) => ({ article: h.article.slug, title: h.article.title, lastReadAt: h.lastReadAt.toISOString() })),
    notifications: u.notifications.map((n) => ({ type: n.type, payload: n.payload, createdAt: n.createdAt.toISOString(), readAt: n.readAt?.toISOString() ?? null })),
    searches: u.searchHistory.map((s) => ({ query: s.query, at: s.createdAt.toISOString() })),
    comments: u.comments.map((c) => ({ article: c.article.slug, body: c.body, at: c.createdAt.toISOString() })),
    articlesWritten: u.articles.map((a) => ({ ...a, createdAt: a.createdAt.toISOString(), publishedAt: a.publishedAt?.toISOString() ?? null })),
  };
}

/**
 * Deletes the person's account and personal data. Their email and name are erased (the address becomes free to
 * register again), sessions, bookmarks, history, notifications and searches are deleted. Articles they wrote stay
 * in the newsroom's record, credited to "Deleted user". The last administrator cannot delete themselves.
 */
export async function deleteAccount(deps: Deps, ctx: AuthContext, input: z.infer<typeof deleteAccountSchema>): Promise<void> {
  await enforceRateLimit(`delete:${ctx.id}`, 5, 60 * 60_000);
  const user = await deps.db.user.findFirst({ where: { id: ctx.id, deletedAt: null }, select: { passwordHash: true } });
  if (!user) throw Errors.unauthenticated();
  if (!(await verifyPassword(user.passwordHash, input.password))) { await burnVerify(input.password); throw field("password", "Password is incorrect"); }
  const now = deps.now();
  await deps.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(70011)::text AS locked`; // same lock as role changes
    if (ctx.roles.includes("ADMIN")) {
      const others = await tx.userRole.count({ where: { role: { name: "ADMIN" }, userId: { not: ctx.id }, user: { deletedAt: null } } });
      if (others === 0) throw Errors.conflict("You are the only administrator. Make someone else an administrator before deleting your account.");
    }
    const id = ctx.id;
    await tx.session.deleteMany({ where: { userId: id } });
    await tx.passwordResetToken.deleteMany({ where: { userId: id } });
    await tx.bookmark.deleteMany({ where: { userId: id } });
    await tx.readingHistory.deleteMany({ where: { userId: id } });
    await tx.notification.deleteMany({ where: { userId: id } });
    await tx.searchHistory.deleteMany({ where: { userId: id } });
    await tx.articleEngagement.deleteMany({ where: { viewerKey: `u:${id}` } });
    await tx.userRole.deleteMany({ where: { userId: id } });
    await tx.authorProfile.deleteMany({ where: { userId: id } });
    await tx.comment.updateMany({ where: { userId: id }, data: { body: "[deleted]", deletedAt: now } });
    await tx.user.update({
      where: { id },
      data: {
        email: `deleted-${id}@deleted.invalid`, name: "Deleted user", avatarUrl: null, preferences: Prisma.DbNull, emailVerifiedAt: null, deletedAt: now,
        passwordHash: `!${randomBytes(16).toString("hex")}`, // not a valid hash: nobody can ever sign in to this row
        interests: { set: [] },
      },
    });
    await writeAudit(tx, { actorId: null, action: "account.delete", entityType: "User", entityId: id }); // no personal data in the log
  });
}
