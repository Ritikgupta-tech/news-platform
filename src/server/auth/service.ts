import { createHmac } from "node:crypto";
import { Prisma } from "@prisma/client";
import { ApiError, Errors } from "@/lib/api/errors";
import { ROLES, type RoleKey } from "@/lib/permissions";
import { writeAudit } from "@/server/audit/audit";
import type { Deps } from "@/server/container";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { REFRESH_TTL_SECONDS, ACCESS_TTL_SECONDS } from "./cookies";
import { burnVerify, hashPassword, verifyPassword } from "./password";
import { signAccessToken } from "./jwt";
import { generateOpaqueToken, sha256 } from "./tokens";
import type { LoginInput, RegisterInput } from "./validation";

export interface RequestMeta { ip: string; userAgent: string | null }

export interface AuthUserDto {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  timezone: string;
  roles: RoleKey[];
  canPublishDirectly: boolean;
  emailVerified: boolean;
}

export interface IssuedSession { user: AuthUserDto; accessToken: string; refreshToken: string }

const MAX_SESSION_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const ROTATION_GRACE_MS = 10_000;
const RESET_TTL_MS = 60 * 60 * 1000;

export const userInclude = { roles: { include: { role: true } }, authorProfile: true } satisfies Prisma.UserInclude;
export type UserWithRoles = Prisma.UserGetPayload<{ include: typeof userInclude }>;

export function toAuthUser(u: UserWithRoles): AuthUserDto {
  const roles = u.roles.map((r) => r.role.name).filter((n): n is RoleKey => (ROLES as readonly string[]).includes(n));
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatarUrl,
    timezone: u.timezone,
    roles,
    canPublishDirectly: u.authorProfile?.canPublishDirectly ?? false,
    emailVerified: u.emailVerifiedAt !== null,
  };
}

const unauthenticated = () => new ApiError(401, "UNAUTHENTICATED", "Invalid or expired session");
const ipHash = (deps: Deps, ip: string) => createHmac("sha256", deps.env.JWT_REFRESH_SECRET).update(ip).digest("hex").slice(0, 32);

async function issueSession(deps: Deps, user: UserWithRoles, meta: RequestMeta): Promise<IssuedSession> {
  const refresh = generateOpaqueToken();
  const now = deps.now();
  const session = await deps.db.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: refresh.hash,
      userAgent: meta.userAgent?.slice(0, 255) ?? null,
      ipHash: ipHash(deps, meta.ip),
      expiresAt: new Date(now.getTime() + REFRESH_TTL_SECONDS * 1000),
    },
  });
  const accessToken = await signAccessToken({ userId: user.id, sessionId: session.id }, deps.env.JWT_ACCESS_SECRET, ACCESS_TTL_SECONDS, now.getTime());
  return { user: toAuthUser(user), accessToken, refreshToken: refresh.token };
}

export async function register(deps: Deps, input: RegisterInput, meta: RequestMeta): Promise<IssuedSession> {
  await enforceRateLimit(`register:ip:${meta.ip}`, 10, 60 * 60_000);
  const email = input.email;
  if (await deps.db.user.findUnique({ where: { email }, select: { id: true } })) {
    throw Errors.conflict("An account with this email already exists");
  }
  const passwordHash = await hashPassword(input.password);
  const reader = await deps.db.role.findUniqueOrThrow({ where: { name: "READER" } });
  let user: UserWithRoles;
  try {
    user = await deps.db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email, name: input.name, passwordHash, timezone: input.timezone ?? "UTC", roles: { create: { roleId: reader.id } } },
        include: userInclude,
      });
      await writeAudit(tx, { actorId: created.id, action: "auth.register", entityType: "User", entityId: created.id });
      return created;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw Errors.conflict("An account with this email already exists");
    throw e;
  }
  return issueSession(deps, user, meta);
}

export async function login(deps: Deps, input: LoginInput, meta: RequestMeta): Promise<IssuedSession> {
  await enforceRateLimit(`login:ip:${meta.ip}`, 30, 15 * 60_000);
  await enforceRateLimit(`login:email:${input.email}`, 8, 15 * 60_000);
  const user = await deps.db.user.findFirst({ where: { email: input.email, deletedAt: null }, include: userInclude });
  let ok = false;
  if (user) ok = await verifyPassword(user.passwordHash, input.password);
  else await burnVerify(input.password);
  if (!user || !ok) throw new ApiError(401, "UNAUTHENTICATED", "Invalid email or password");
  await writeAudit(deps.db, { actorId: user.id, action: "auth.login", entityType: "User", entityId: user.id });
  return issueSession(deps, user, meta);
}

/** Rotates the refresh token. Presenting an already-rotated token (outside a short grace window) revokes the session. */
export async function refresh(deps: Deps, refreshToken: string): Promise<IssuedSession> {
  const hash = sha256(refreshToken);
  const now = deps.now();
  const session = await deps.db.session.findUnique({ where: { refreshTokenHash: hash }, include: { user: { include: userInclude } } });

  if (!session) {
    const reused = await deps.db.session.findUnique({ where: { prevRefreshTokenHash: hash } });
    if (reused && !reused.revokedAt) {
      const withinGrace = reused.rotatedAt !== null && now.getTime() - reused.rotatedAt.getTime() < ROTATION_GRACE_MS;
      if (!withinGrace) {
        await deps.db.$transaction(async (tx) => {
          await tx.session.update({ where: { id: reused.id }, data: { revokedAt: now } });
          await tx.notification.create({ data: { userId: reused.userId, type: "SECURITY_EVENT", payload: { event: "refresh_token_reuse", sessionId: reused.id } } });
          await writeAudit(tx, { actorId: reused.userId, action: "auth.refresh_reuse_detected", entityType: "Session", entityId: reused.id });
        });
      }
    }
    throw unauthenticated();
  }
  if (session.revokedAt || session.expiresAt <= now || session.user.deletedAt) throw unauthenticated();

  const next = generateOpaqueToken();
  const expiresAt = new Date(Math.min(now.getTime() + REFRESH_TTL_SECONDS * 1000, session.createdAt.getTime() + MAX_SESSION_AGE_MS));
  const rotated = await deps.db.session.updateMany({
    where: { id: session.id, refreshTokenHash: hash, revokedAt: null },
    data: { refreshTokenHash: next.hash, prevRefreshTokenHash: hash, rotatedAt: now, expiresAt },
  });
  if (rotated.count !== 1) throw unauthenticated(); // lost a race with a concurrent refresh

  const accessToken = await signAccessToken({ userId: session.userId, sessionId: session.id }, deps.env.JWT_ACCESS_SECRET, ACCESS_TTL_SECONDS, now.getTime());
  return { user: toAuthUser(session.user), accessToken, refreshToken: next.token };
}

export async function logout(deps: Deps, opts: { sessionId?: string; refreshToken?: string }): Promise<void> {
  const now = deps.now();
  if (opts.sessionId) {
    await deps.db.session.updateMany({ where: { id: opts.sessionId, revokedAt: null }, data: { revokedAt: now } });
  } else if (opts.refreshToken) {
    await deps.db.session.updateMany({ where: { refreshTokenHash: sha256(opts.refreshToken), revokedAt: null }, data: { revokedAt: now } });
  }
}

/** Always resolves the same way whether or not the email exists (no account enumeration). */
export async function forgotPassword(deps: Deps, email: string, meta: RequestMeta): Promise<void> {
  await enforceRateLimit(`forgot:ip:${meta.ip}`, 10, 60 * 60_000);
  await enforceRateLimit(`forgot:email:${email}`, 3, 60 * 60_000);
  const user = await deps.db.user.findFirst({ where: { email, deletedAt: null }, select: { id: true, email: true, name: true } });
  if (!user) return;
  const token = generateOpaqueToken();
  const now = deps.now();
  await deps.db.$transaction([
    deps.db.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    deps.db.passwordResetToken.create({ data: { userId: user.id, tokenHash: token.hash, expiresAt: new Date(now.getTime() + RESET_TTL_MS) } }),
  ]);
  const link = `${deps.env.APP_URL}/reset-password?token=${token.token}`;
  try {
    await deps.mailer.send({
      to: user.email,
      subject: "Reset your password",
      text: `Hi ${user.name},\n\nUse this link to choose a new password. It expires in 1 hour:\n${link}\n\nIf you did not ask for this, you can ignore this email.`,
    });
  } catch (e) {
    console.error("[auth] password reset email failed", e); // never surface to the caller
  }
}

export async function resetPassword(deps: Deps, input: { token: string; password: string }): Promise<void> {
  const invalid = () => new ApiError(400, "INVALID_TOKEN", "This reset link is invalid or has expired");
  const now = deps.now();
  const rec = await deps.db.passwordResetToken.findUnique({ where: { tokenHash: sha256(input.token) }, include: { user: true } });
  if (!rec || rec.usedAt || rec.expiresAt <= now || rec.user.deletedAt) throw invalid();
  const passwordHash = await hashPassword(input.password);
  await deps.db.$transaction(async (tx) => {
    const claimed = await tx.passwordResetToken.updateMany({ where: { id: rec.id, usedAt: null }, data: { usedAt: now } });
    if (claimed.count !== 1) throw invalid(); // double-use race
    await tx.user.update({ where: { id: rec.userId }, data: { passwordHash } });
    await tx.session.updateMany({ where: { userId: rec.userId, revokedAt: null }, data: { revokedAt: now } });
    await tx.notification.create({ data: { userId: rec.userId, type: "SECURITY_EVENT", payload: { event: "password_reset" } } });
    await writeAudit(tx, { actorId: rec.userId, action: "auth.password_reset", entityType: "User", entityId: rec.userId });
  });
  try {
    await deps.mailer.send({ to: rec.user.email, subject: "Your password was changed", text: "Your password was just changed and all sessions were signed out. If this wasn't you, contact support immediately." });
  } catch (e) {
    console.error("[auth] password change email failed", e);
  }
}

export async function getUserDto(deps: Deps, userId: string): Promise<AuthUserDto> {
  const user = await deps.db.user.findFirst({ where: { id: userId, deletedAt: null }, include: userInclude });
  if (!user) throw Errors.unauthenticated();
  return toAuthUser(user);
}
