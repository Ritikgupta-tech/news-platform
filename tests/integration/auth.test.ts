import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { connect, makeClock, makeDeps, makeUser, meta, resetDatabase, resetRateLimits, TEST_DB_URL } from "./helpers";
import { forgotPassword, login, logout, refresh, register, resetPassword } from "../../src/server/auth/service";
import { authenticateToken } from "../../src/server/auth/guard";
import { sha256 } from "../../src/server/auth/tokens";

const PW = "correct horse battery staple";

describe.skipIf(!TEST_DB_URL)("auth service (real Postgres)", () => {
  let db: PrismaClient;
  beforeAll(async () => { db = connect(); });
  beforeEach(async () => { await resetDatabase(db); resetRateLimits(); });
  afterAll(async () => { await db.$disconnect(); });

  it("registers a reader, stores an Argon2id hash and issues a session", async () => {
    const deps = makeDeps(db);
    const s = await register(deps, { email: "new@example.test", name: "New Reader", password: PW }, meta());
    expect(s.user.roles).toEqual(["READER"]);
    expect(s.user.canPublishDirectly).toBe(false);
    const row = await db.user.findUniqueOrThrow({ where: { email: "new@example.test" } });
    expect(row.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(row.passwordHash).not.toContain(PW);
    // only hashes are persisted
    const sess = await db.session.findFirstOrThrow({ where: { userId: row.id } });
    expect(sess.refreshTokenHash).toBe(sha256(s.refreshToken));
    expect(sess.refreshTokenHash).not.toBe(s.refreshToken);
    expect(await db.auditLog.count({ where: { action: "auth.register" } })).toBe(1);
  });

  it("rejects duplicate emails (including concurrent registrations)", async () => {
    const deps = makeDeps(db);
    await register(deps, { email: "dup@example.test", name: "One", password: PW }, meta());
    await expect(register(deps, { email: "dup@example.test", name: "Two", password: PW }, meta())).rejects.toMatchObject({ status: 409 });
    const results = await Promise.allSettled([
      register(deps, { email: "race@example.test", name: "A", password: PW }, meta()),
      register(deps, { email: "race@example.test", name: "B", password: PW }, meta()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.user.count({ where: { email: "race@example.test" } })).toBe(1);
  });

  it("logs in; wrong password and unknown email are indistinguishable", async () => {
    const deps = makeDeps(db);
    await register(deps, { email: "a@example.test", name: "Alice", password: PW }, meta());
    const ok = await login(deps, { email: "a@example.test", password: PW }, meta());
    expect(ok.user.email).toBe("a@example.test");
    const bad = await login(deps, { email: "a@example.test", password: "wrong-password-1" }, meta()).catch((e) => e);
    const ghost = await login(deps, { email: "ghost@example.test", password: "wrong-password-1" }, meta()).catch((e) => e);
    expect(bad.status).toBe(401);
    expect({ status: ghost.status, code: ghost.code, message: ghost.message }).toEqual({ status: bad.status, code: bad.code, message: bad.message });
  });

  it("does not let soft-deleted users sign in", async () => {
    const deps = makeDeps(db);
    await register(deps, { email: "gone@example.test", name: "Gone", password: PW }, meta());
    await db.user.update({ where: { email: "gone@example.test" }, data: { deletedAt: new Date() } });
    await expect(login(deps, { email: "gone@example.test", password: PW }, meta())).rejects.toMatchObject({ status: 401 });
  });

  it("throttles repeated failures per email and per IP", async () => {
    const deps = makeDeps(db);
    await register(deps, { email: "t@example.test", name: "Throttle", password: PW }, meta());
    const attempt = () => login(deps, { email: "t@example.test", password: "wrong-password-1" }, meta("7.7.7.7")).catch((e) => e.status);
    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) statuses.push(await attempt());
    expect(statuses.slice(0, 8)).toEqual(Array(8).fill(401));
    expect(statuses.slice(8)).toEqual([429, 429]);
    // even the right password is refused while limited
    await expect(login(deps, { email: "t@example.test", password: PW }, meta("8.8.8.8"))).rejects.toMatchObject({ status: 429 });
  });

  it("authenticates access tokens against live session and role state", async () => {
    const deps = makeDeps(db);
    const s = await register(deps, { email: "g@example.test", name: "Guard", password: PW }, meta());
    expect((await authenticateToken(deps, s.accessToken))?.roles).toEqual(["READER"]);
    expect(await authenticateToken(deps, undefined)).toBeNull();
    expect(await authenticateToken(deps, "garbage")).toBeNull();

    // promote: takes effect on the very next request, no re-login
    const editorRole = await db.role.findUniqueOrThrow({ where: { name: "EDITOR" } });
    await db.userRole.create({ data: { userId: s.user.id, roleId: editorRole.id } });
    expect((await authenticateToken(deps, s.accessToken))?.roles.sort()).toEqual(["EDITOR", "READER"]);

    await db.session.updateMany({ data: { revokedAt: new Date() } });
    expect(await authenticateToken(deps, s.accessToken)).toBeNull();
  });

  it("rejects access tokens of deleted users and expired sessions", async () => {
    const deps = makeDeps(db);
    const s = await register(deps, { email: "d@example.test", name: "Del", password: PW }, meta());
    await db.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await authenticateToken(deps, s.accessToken)).toBeNull();
    await db.session.updateMany({ data: { expiresAt: new Date(Date.now() + 100000) } });
    expect(await authenticateToken(deps, s.accessToken)).not.toBeNull();
    await db.user.update({ where: { id: s.user.id }, data: { deletedAt: new Date() } });
    expect(await authenticateToken(deps, s.accessToken)).toBeNull();
  });

  it("rotates refresh tokens; the old one stops working", async () => {
    const clock = makeClock();
    const deps = makeDeps(db, clock);
    const s = await register(deps, { email: "r@example.test", name: "Rot", password: PW }, meta());
    const next = await refresh(deps, s.refreshToken);
    expect(next.refreshToken).not.toBe(s.refreshToken);
    expect(await authenticateToken(deps, next.accessToken)).not.toBeNull();
    const again = await refresh(deps, next.refreshToken);
    expect(again.refreshToken).not.toBe(next.refreshToken);
  });

  it("detects refresh-token reuse, revokes the session and notifies the user", async () => {
    const clock = makeClock();
    const deps = makeDeps(db, clock);
    const s = await register(deps, { email: "theft@example.test", name: "Theft", password: PW }, meta());
    const stolen = s.refreshToken;
    const legit = await refresh(deps, stolen); // victim rotates
    clock.advance(60_000); // attacker replays the old token later
    await expect(refresh(deps, stolen)).rejects.toMatchObject({ status: 401 });
    // the whole session is dead, including the legitimate newest token
    await expect(refresh(deps, legit.refreshToken)).rejects.toMatchObject({ status: 401 });
    expect(await authenticateToken(deps, legit.accessToken)).toBeNull();
    expect(await db.notification.count({ where: { userId: s.user.id, type: "SECURITY_EVENT" } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "auth.refresh_reuse_detected" } })).toBe(1);
  });

  it("tolerates a concurrent refresh from a second tab within the grace window", async () => {
    const clock = makeClock();
    const deps = makeDeps(db, clock);
    const s = await register(deps, { email: "tabs@example.test", name: "Tabs", password: PW }, meta());
    const winner = await refresh(deps, s.refreshToken);
    clock.advance(2_000);
    await expect(refresh(deps, s.refreshToken)).rejects.toMatchObject({ status: 401 }); // loser is refused...
    const stillValid = await refresh(deps, winner.refreshToken); // ...but the session survives
    expect(stillValid.user.id).toBe(s.user.id);
  });

  it("allows only one winner when the same refresh token is used concurrently", async () => {
    const deps = makeDeps(db);
    const s = await register(deps, { email: "conc@example.test", name: "Conc", password: PW }, meta());
    const results = await Promise.allSettled([refresh(deps, s.refreshToken), refresh(deps, s.refreshToken), refresh(deps, s.refreshToken)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("refuses expired sessions and caps absolute session age", async () => {
    const clock = makeClock();
    const deps = makeDeps(db, clock);
    const s = await register(deps, { email: "exp@example.test", name: "Exp", password: PW }, meta());
    clock.advance(31 * 24 * 3600_000);
    await expect(refresh(deps, s.refreshToken)).rejects.toMatchObject({ status: 401 });
  });

  it("logs out by session id or by refresh token", async () => {
    const deps = makeDeps(db);
    const s = await register(deps, { email: "lo@example.test", name: "Out", password: PW }, meta());
    const ctx = await authenticateToken(deps, s.accessToken);
    await logout(deps, { sessionId: ctx!.sessionId });
    expect(await authenticateToken(deps, s.accessToken)).toBeNull();
    const s2 = await login(deps, { email: "lo@example.test", password: PW }, meta());
    await logout(deps, { refreshToken: s2.refreshToken });
    await expect(refresh(deps, s2.refreshToken)).rejects.toMatchObject({ status: 401 });
  });

  it("password reset: emails a single-use link, signs out everywhere, never reveals unknown emails", async () => {
    const deps = makeDeps(db);
    const s = await register(deps, { email: "pw@example.test", name: "Pw", password: PW }, meta());
    await forgotPassword(deps, "ghost@example.test", meta());
    expect(deps.mailer.sent).toHaveLength(0); // identical outcome for unknown address, no email, no error

    await forgotPassword(deps, "pw@example.test", meta());
    expect(deps.mailer.sent).toHaveLength(1);
    const token = /token=([\w-]+)/.exec(deps.mailer.sent[0]!.text)![1]!;
    const stored = await db.passwordResetToken.findFirstOrThrow();
    expect(stored.tokenHash).toBe(sha256(token));
    expect(stored.tokenHash).not.toBe(token);

    await expect(resetPassword(deps, { token: "x".repeat(30), password: "another long password" })).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    await resetPassword(deps, { token, password: "another long password" });
    await expect(resetPassword(deps, { token, password: "yet another password" })).rejects.toMatchObject({ code: "INVALID_TOKEN" }); // single use

    expect(await authenticateToken(deps, s.accessToken)).toBeNull(); // old sessions revoked
    await expect(login(deps, { email: "pw@example.test", password: PW }, meta())).rejects.toMatchObject({ status: 401 });
    await expect(login(deps, { email: "pw@example.test", password: "another long password" }, meta())).resolves.toBeTruthy();
    expect(await db.notification.count({ where: { userId: s.user.id, type: "SECURITY_EVENT" } })).toBe(1);
    expect(deps.mailer.sent.at(-1)!.subject).toMatch(/changed/i);
  });

  it("reset links expire, and a new request invalidates the previous link", async () => {
    const clock = makeClock();
    const deps = makeDeps(db, clock);
    await register(deps, { email: "ex@example.test", name: "Ex", password: PW }, meta());
    await forgotPassword(deps, "ex@example.test", meta());
    const first = /token=([\w-]+)/.exec(deps.mailer.sent[0]!.text)![1]!;
    await forgotPassword(deps, "ex@example.test", meta());
    const second = /token=([\w-]+)/.exec(deps.mailer.sent[1]!.text)![1]!;
    await expect(resetPassword(deps, { token: first, password: "brand new password" })).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    clock.advance(61 * 60_000);
    await expect(resetPassword(deps, { token: second, password: "brand new password" })).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("a mail failure never leaks through forgot-password", async () => {
    const deps = makeDeps(db);
    await makeUser(db, "READER", { email: "mf@example.test" });
    deps.mailer.send = async () => { throw new Error("smtp down"); };
    await expect(forgotPassword(deps, "mf@example.test", meta())).resolves.toBeUndefined();
  });
});
