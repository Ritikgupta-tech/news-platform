import { RoleName, type Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError, Errors } from "@/lib/api/errors";
import { buildPageMeta, paginationSchema, toSkipTake } from "@/lib/api/pagination";
import { ROLES, type RoleKey } from "@/lib/permissions";
import { slugify } from "@/lib/slug";
import { writeAudit } from "@/server/audit/audit";
import { requirePermission, type AuthContext } from "@/server/auth/guard";
import type { Deps } from "@/server/container";

export const listUsersQuery = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  role: z.enum(ROLES).optional(),
});
export const setRolesSchema = z.object({ roles: z.array(z.enum(ROLES)).min(1).max(4) });
export const authorGrantSchema = z.object({ canPublishDirectly: z.boolean() });
export const listAuditQuery = paginationSchema.extend({
  entityType: z.string().trim().max(60).optional(),
  action: z.string().trim().max(80).optional(),
  actorId: z.string().uuid().optional(),
});

export interface AdminUserDto {
  id: string; email: string; name: string; roles: RoleKey[]; canPublishDirectly: boolean; emailVerified: boolean; createdAt: string;
}

const include = { roles: { include: { role: true } }, authorProfile: { select: { canPublishDirectly: true } } } satisfies Prisma.UserInclude;
const toDto = (u: Prisma.UserGetPayload<{ include: typeof include }>): AdminUserDto => ({
  id: u.id, email: u.email, name: u.name,
  roles: u.roles.map((r) => r.role.name as RoleKey),
  canPublishDirectly: u.authorProfile?.canPublishDirectly ?? false,
  emailVerified: u.emailVerifiedAt !== null,
  createdAt: u.createdAt.toISOString(),
});

export async function listUsers(deps: Deps, ctx: AuthContext, q: z.infer<typeof listUsersQuery>) {
  requirePermission(ctx, "user:manage");
  const where: Prisma.UserWhereInput = { deletedAt: null };
  if (q.q) where.OR = [{ email: { contains: q.q, mode: "insensitive" } }, { name: { contains: q.q, mode: "insensitive" } }];
  if (q.role) where.roles = { some: { role: { name: q.role as RoleName } } };
  const [total, rows] = await Promise.all([
    deps.db.user.count({ where }),
    deps.db.user.findMany({ where, include, orderBy: { createdAt: "desc" }, ...toSkipTake(q) }),
  ]);
  return { items: rows.map(toDto), meta: buildPageMeta(q, total) };
}

/** Replaces a user's roles. READER is always kept. Guards against locking everyone out of administration. */
export async function setUserRoles(deps: Deps, ctx: AuthContext, targetId: string, roles: RoleKey[]): Promise<AdminUserDto> {
  requirePermission(ctx, "user:manage");
  const next = [...new Set<RoleKey>(["READER", ...roles])];
  return deps.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(70011)::text AS locked`; // serialises role changes so two admins cannot demote each other concurrently
    const target = await tx.user.findFirst({ where: { id: targetId, deletedAt: null }, include });
    if (!target) throw Errors.notFound("User");
    const before = target.roles.map((r) => r.role.name as RoleKey);
    if (before.includes("ADMIN") && !next.includes("ADMIN")) {
      if (target.id === ctx.id) throw Errors.conflict("You cannot remove your own administrator role");
      const otherAdmins = await tx.userRole.count({ where: { role: { name: "ADMIN" }, userId: { not: target.id }, user: { deletedAt: null } } });
      if (otherAdmins === 0) throw Errors.conflict("At least one administrator must remain");
    }
    const roleRows = await tx.role.findMany({ where: { name: { in: next as RoleName[] } } });
    await tx.userRole.deleteMany({ where: { userId: targetId } });
    await tx.userRole.createMany({ data: roleRows.map((r) => ({ userId: targetId, roleId: r.id })) });
    await writeAudit(tx, { actorId: ctx.id, action: "user.roles.change", entityType: "User", entityId: targetId, metadata: { before, after: next } });
    return toDto(await tx.user.findUniqueOrThrow({ where: { id: targetId }, include }));
  });
}

/** Explicit grant that lets an author publish without review. Off by default. */
export async function setAuthorPublishGrant(deps: Deps, ctx: AuthContext, targetId: string, canPublishDirectly: boolean): Promise<AdminUserDto> {
  requirePermission(ctx, "user:manage");
  return deps.db.$transaction(async (tx) => {
    const target = await tx.user.findFirst({ where: { id: targetId, deletedAt: null }, include });
    if (!target) throw Errors.notFound("User");
    const isWriter = target.roles.some((r) => r.role.name === "AUTHOR" || r.role.name === "EDITOR" || r.role.name === "ADMIN");
    if (!isWriter) throw new ApiError(422, "VALIDATION_ERROR", "Only authors, editors and administrators can be granted publishing rights");
    const existing = await tx.authorProfile.findUnique({ where: { userId: targetId } });
    if (existing) await tx.authorProfile.update({ where: { userId: targetId }, data: { canPublishDirectly } });
    else {
      let slug = slugify(target.name);
      if (await tx.authorProfile.findUnique({ where: { slug } })) slug = `${slug}-${targetId.slice(0, 6)}`;
      await tx.authorProfile.create({ data: { userId: targetId, slug, canPublishDirectly } });
    }
    await writeAudit(tx, { actorId: ctx.id, action: "author.publish_grant", entityType: "User", entityId: targetId, metadata: { canPublishDirectly } });
    return toDto(await tx.user.findUniqueOrThrow({ where: { id: targetId }, include }));
  });
}

export async function listAuditLogs(deps: Deps, ctx: AuthContext, q: z.infer<typeof listAuditQuery>) {
  requirePermission(ctx, "audit:view");
  const where: Prisma.AuditLogWhereInput = {};
  if (q.entityType) where.entityType = q.entityType;
  if (q.action) where.action = { startsWith: q.action };
  if (q.actorId) where.actorId = q.actorId;
  const [total, rows] = await Promise.all([
    deps.db.auditLog.count({ where }),
    deps.db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, ...toSkipTake(q), include: { actor: { select: { name: true, email: true } } } }),
  ]);
  const items = rows.map((r) => ({
    id: r.id, action: r.action, entityType: r.entityType, entityId: r.entityId, metadata: r.metadata,
    actor: r.actor ? { id: r.actorId, name: r.actor.name } : null, createdAt: r.createdAt.toISOString(),
  }));
  return { items, meta: buildPageMeta(q, total) };
}
