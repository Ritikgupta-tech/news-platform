import { Errors } from "@/lib/api/errors";
import { can, type PermissionKey } from "@/lib/permissions";
import type { Deps } from "@/server/container";
import { assertSameOrigin } from "@/server/security/csrf";
import { ACCESS_COOKIE, parseCookies } from "./cookies";
import { toAuthUser, userInclude, type AuthUserDto } from "./service";
import { verifyAccessToken } from "./jwt";

export interface AuthContext extends AuthUserDto { sessionId: string }

/** Resolves an access token to a live user. Roles are read from the database on every request, so role changes apply immediately. */
export async function authenticateToken(deps: Deps, token: string | undefined): Promise<AuthContext | null> {
  if (!token) return null;
  const claims = await verifyAccessToken(token, deps.env.JWT_ACCESS_SECRET);
  if (!claims) return null;
  const session = await deps.db.session.findUnique({ where: { id: claims.sessionId }, include: { user: { include: userInclude } } });
  const now = deps.now();
  if (!session || session.userId !== claims.userId || session.revokedAt || session.expiresAt <= now || session.user.deletedAt) return null;
  return { ...toAuthUser(session.user), sessionId: session.id };
}

export function accessTokenFrom(req: Request): string | undefined {
  return parseCookies(req.headers.get("cookie"))[ACCESS_COOKIE];
}

export async function optionalAuth(deps: Deps, req: Request): Promise<AuthContext | null> {
  return authenticateToken(deps, accessTokenFrom(req));
}

/** 401 if not signed in. State-changing requests must also pass the same-origin (CSRF) check. */
export async function requireAuth(deps: Deps, req: Request): Promise<AuthContext> {
  const ctx = await optionalAuth(deps, req);
  if (!ctx) throw Errors.unauthenticated();
  assertSameOrigin(req, deps.env.APP_URL);
  return ctx;
}

export function requirePermission(ctx: Pick<AuthContext, "roles">, permission: PermissionKey): void {
  if (!can(ctx.roles, permission)) throw Errors.forbidden();
}

export const hasPermission = (ctx: Pick<AuthContext, "roles"> | null, permission: PermissionKey): boolean => !!ctx && can(ctx.roles, permission);
