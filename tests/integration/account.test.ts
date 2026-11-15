import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ZodError } from "zod";
import { connect, ctxFor, makeArticle, makeDeps, makeUser, meta, resetDatabase, resetRateLimits, TEST_DB_URL } from "./helpers";
import { changePassword, deleteAccount, exportData, revokeOtherSessions, updateProfile, updateProfileSchema } from "../../src/server/account/service";
import { login, register } from "../../src/server/auth/service";
import { authenticateToken } from "../../src/server/auth/guard";
import { hashPassword } from "../../src/server/auth/password";
import { addBookmark } from "../../src/server/reader/bookmarks";
import { recordRead } from "../../src/server/reader/history";
import { updatePreferences } from "../../src/server/reader/preferences";
import { setUserRoles } from "../../src/server/users/service";

const PW = "correct horse battery staple";
const NEW_PW = "a brand new passphrase 42";

describe.skipIf(!TEST_DB_URL)("account management (real Postgres)", () => {
  let db: PrismaClient;
  let deps: ReturnType<typeof makeDeps>;
  beforeAll(() => { db = connect(); });
  beforeEach(async () => { await resetDatabase(db); resetRateLimits(); deps = makeDeps(db); });
  afterAll(async () => { await db.$disconnect(); });

  /** A real registered user with a live session. */
  async function signedUp(email = "reader@example.test", name = "Reader One") {
    const s = await register(deps, { email, name, password: PW }, meta());
    const ctx = (await authenticateToken(deps, s.accessToken))!;
    return { s, ctx };
  }

  it("updates the name and timezone, and validates them", async () => {
    const { ctx } = await signedUp();
    const u = await updateProfile(deps, ctx.id, { name: "Renamed Reader", timezone: "Asia/Kolkata" });
    expect(u).toMatchObject({ name: "Renamed Reader", timezone: "Asia/Kolkata" });
    expect(updateProfileSchema.safeParse({ timezone: "Mars/Base" }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ name: "x" }).success).toBe(false);
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
    expect(updateProfileSchema.safeParse({ email: "new@example.test", name: "Fine Name" }).data).not.toHaveProperty("email"); // e-mail cannot be changed here
  });

  describe("change password", () => {
    it("needs the current password, signs out other devices but not this one, and alerts the owner", async () => {
      const { s, ctx } = await signedUp();
      const other = await login(deps, { email: "reader@example.test", password: PW }, meta());
      await expect(changePassword(deps, ctx, { currentPassword: "wrong-password-here", newPassword: NEW_PW })).rejects.toMatchObject({ code: "VALIDATION_ERROR", details: [{ path: "currentPassword" }] });
      await expect(changePassword(deps, ctx, { currentPassword: PW, newPassword: PW })).rejects.toMatchObject({ details: [{ path: "newPassword" }] });
      const r = await changePassword(deps, ctx, { currentPassword: PW, newPassword: NEW_PW });
      expect(r.otherSessionsRevoked).toBe(1);
      expect(await authenticateToken(deps, s.accessToken)).not.toBeNull(); // still signed in here
      expect(await authenticateToken(deps, other.accessToken)).toBeNull(); // the other device is out
      await expect(login(deps, { email: "reader@example.test", password: PW }, meta())).rejects.toMatchObject({ status: 401 });
      await expect(login(deps, { email: "reader@example.test", password: NEW_PW }, meta())).resolves.toBeTruthy();
      expect((await db.notification.findFirstOrThrow({ where: { userId: ctx.id, type: "SECURITY_EVENT" } })).payload).toMatchObject({ event: "password_changed" });
      expect(deps.mailer.sent.at(-1)!.subject).toMatch(/changed/i);
    });

    it("rejects weak new passwords and throttles guessing of the current one", async () => {
      const { ctx } = await signedUp();
      const { changePasswordSchema } = await import("../../src/server/account/service");
      expect(changePasswordSchema.safeParse({ currentPassword: PW, newPassword: "short" }).success).toBe(false);
      const codes: number[] = [];
      for (let i = 0; i < 7; i++) codes.push(await changePassword(deps, ctx, { currentPassword: `guess-number-${i}-xx`, newPassword: NEW_PW }).then(() => 200, (e) => e.status));
      expect(codes).toEqual([422, 422, 422, 422, 422, 429, 429]);
    });
  });

  it("signs out all other devices on request and records it", async () => {
    const { s, ctx } = await signedUp();
    const b = await login(deps, { email: "reader@example.test", password: PW }, meta());
    const c = await login(deps, { email: "reader@example.test", password: PW }, meta());
    expect(await revokeOtherSessions(deps, ctx)).toEqual({ revoked: 2 });
    expect(await authenticateToken(deps, s.accessToken)).not.toBeNull();
    expect(await authenticateToken(deps, b.accessToken)).toBeNull();
    expect(await authenticateToken(deps, c.accessToken)).toBeNull();
    expect(await db.auditLog.count({ where: { action: "account.sessions_revoke_others" } })).toBe(1);
  });

  describe("data export", () => {
    it("contains the person's data and none of the secrets", async () => {
      const { s, ctx } = await signedUp();
      const author = await makeUser(db, "AUTHOR");
      const art = await makeArticle(db, { authorId: author.id, title: "Exported story" });
      await addBookmark(deps, ctx.id, art.id);
      await recordRead(deps, ctx.id, art.id);
      await updatePreferences(deps, ctx.id, { recordReadingHistory: true, editorialNotifications: false });
      await db.searchHistory.create({ data: { userId: ctx.id, query: "transit budget" } });
      const data = await exportData(deps, ctx.id);
      expect(data.profile).toMatchObject({ email: "reader@example.test", name: "Reader One", roles: ["READER"] });
      expect(data.bookmarks).toEqual([expect.objectContaining({ title: "Exported story" })]);
      expect(data.readingHistory).toHaveLength(1);
      expect(data.searches).toEqual([expect.objectContaining({ query: "transit budget" })]);
      expect(data.preferences).toEqual({ editorialNotifications: false, recordReadingHistory: true });
      const text = JSON.stringify(data);
      const row = await db.user.findUniqueOrThrow({ where: { id: ctx.id } });
      const sess = await db.session.findFirstOrThrow({ where: { userId: ctx.id } });
      for (const secret of [row.passwordHash, sess.refreshTokenHash, s.refreshToken, s.accessToken]) expect(text).not.toContain(secret);
      expect(text).not.toMatch(/passwordHash|refreshTokenHash|argon2/i);
    });

    it("lists the articles an author wrote, and is rate limited", async () => {
      const u = await makeUser(db, "AUTHOR");
      await makeArticle(db, { authorId: u.id, title: "Mine to keep", status: "DRAFT" });
      expect((await exportData(deps, u.id)).articlesWritten).toEqual([expect.objectContaining({ title: "Mine to keep", status: "DRAFT" })]);
      await exportData(deps, u.id); await exportData(deps, u.id);
      await expect(exportData(deps, u.id)).rejects.toMatchObject({ status: 429 });
    });
  });

  describe("account deletion", () => {
    it("requires the password and the confirmation word", async () => {
      const { ctx } = await signedUp();
      await expect(deleteAccount(deps, ctx, { password: "wrong-password-here", confirm: "DELETE" })).rejects.toMatchObject({ code: "VALIDATION_ERROR", details: [{ path: "password" }] });
      const { deleteAccountSchema } = await import("../../src/server/account/service");
      expect(deleteAccountSchema.safeParse({ password: PW, confirm: "delete" }).success).toBe(false);
      expect(await db.user.count({ where: { id: ctx.id, deletedAt: null } })).toBe(1); // nothing happened
    });

    it("erases personal data, signs out everywhere, frees the e-mail, and keeps the newsroom's record", async () => {
      const { s, ctx } = await signedUp("leaving@example.test", "Leaving Person");
      const author = await makeUser(db, "AUTHOR");
      const art = await makeArticle(db, { authorId: author.id, title: "Remembered story" });
      await addBookmark(deps, ctx.id, art.id);
      await recordRead(deps, ctx.id, art.id);
      await db.searchHistory.create({ data: { userId: ctx.id, query: "private query" } });
      await db.notification.create({ data: { userId: ctx.id, type: "SECURITY_EVENT", payload: { event: "x" } } });

      await deleteAccount(deps, ctx, { password: PW, confirm: "DELETE" });

      const row = await db.user.findUniqueOrThrow({ where: { id: ctx.id } });
      expect(row).toMatchObject({ name: "Deleted user", avatarUrl: null, emailVerifiedAt: null });
      expect(row.email).toBe(`deleted-${ctx.id}@deleted.invalid`);
      expect(row.deletedAt).not.toBeNull();
      expect(row.passwordHash.startsWith("$argon2")).toBe(false); // cannot ever match a password
      for (const t of [db.session, db.bookmark, db.readingHistory, db.notification, db.searchHistory, db.userRole] as unknown as { count: (a: unknown) => Promise<number> }[]) {
        expect(await t.count({ where: { userId: ctx.id } })).toBe(0);
      }
      expect(await db.articleEngagement.count({ where: { viewerKey: `u:${ctx.id}` } })).toBe(0);
      expect(await authenticateToken(deps, s.accessToken)).toBeNull();
      await expect(login(deps, { email: "leaving@example.test", password: PW }, meta())).rejects.toMatchObject({ status: 401 });
      // the address can be used again, as a brand-new account
      await expect(register(deps, { email: "leaving@example.test", name: "Back Again", password: PW }, meta())).resolves.toBeTruthy();
      // audit trail exists but holds no personal data
      const log = await db.auditLog.findFirstOrThrow({ where: { action: "account.delete" } });
      expect(JSON.stringify(log)).not.toMatch(/leaving@example|Leaving Person/);
    });

    it("keeps articles an author wrote, credited to 'Deleted user'", async () => {
      const u = await makeUser(db, "AUTHOR", { email: "writer@example.test", passwordHash: await hashPassword(PW) });
      const art = await makeArticle(db, { authorId: u.id, title: "Written before leaving" });
      await deleteAccount(deps, await ctxFor(db, u.id), { password: PW, confirm: "DELETE" });
      const kept = await db.article.findUniqueOrThrow({ where: { id: art.id }, include: { author: { select: { name: true } } } });
      expect(kept.author.name).toBe("Deleted user");
      expect(kept.status).toBe("PUBLISHED");
      expect(await db.authorProfile.count({ where: { userId: u.id } })).toBe(0);
    });

    it("never leaves the platform without an administrator", async () => {
      const a1 = await makeUser(db, "ADMIN", { passwordHash: await hashPassword(PW) });
      const ctx1 = await ctxFor(db, a1.id);
      await expect(deleteAccount(deps, ctx1, { password: PW, confirm: "DELETE" })).rejects.toMatchObject({ status: 409 });
      const a2 = await makeUser(db, "ADMIN");
      await deleteAccount(deps, ctx1, { password: PW, confirm: "DELETE" }); // fine now: another admin exists
      expect(await db.user.count({ where: { id: a1.id, deletedAt: { not: null } } })).toBe(1);
      // and the remaining admin is now the last one
      const ctx2 = await ctxFor(db, a2.id);
      await expect(setUserRoles(deps, ctx2, a2.id, ["READER"])).rejects.toMatchObject({ status: 409 });
    });

    it("rejects deletion attempts through the schema when nothing is confirmed", async () => {
      const { deleteAccountSchema } = await import("../../src/server/account/service");
      expect(() => deleteAccountSchema.parse({ password: PW })).toThrow(ZodError);
    });
  });
});
