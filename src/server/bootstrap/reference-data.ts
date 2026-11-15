import type { PrismaClient } from "@prisma/client";
import { PERMISSIONS, ROLE_PERMISSIONS, ROLES } from "../../lib/permissions";
import { slugify } from "../../lib/slug";

export const DEFAULT_CATEGORIES = [
  "World", "India", "Politics", "Business", "Technology", "Science",
  "Health", "Sports", "Entertainment", "Lifestyle", "Education", "Environment",
];

/** Idempotent. Roles, permissions and default categories; safe to run in any environment. */
export async function seedReferenceData(db: PrismaClient): Promise<void> {
  for (const key of PERMISSIONS) {
    await db.permission.upsert({ where: { key }, update: {}, create: { key } });
  }
  for (const name of ROLES) {
    const role = await db.role.upsert({ where: { name }, update: {}, create: { name } });
    const perms = await db.permission.findMany({ where: { key: { in: [...ROLE_PERMISSIONS[name]] } } });
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    await db.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })) });
  }
  for (const [i, name] of DEFAULT_CATEGORIES.entries()) {
    const slug = slugify(name);
    await db.category.upsert({ where: { slug }, update: {}, create: { slug, name, sortOrder: i } });
  }
}
