import { Prisma } from "@prisma/client";
import { z } from "zod";
import { Errors } from "@/lib/api/errors";
import { slugify } from "@/lib/slug";
import { writeAudit } from "@/server/audit/audit";
import type { AuthContext } from "@/server/auth/guard";
import { requirePermission } from "@/server/auth/guard";
import type { Deps } from "@/server/container";

const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lowercase letters, numbers and hyphens only").max(60);
export const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: slug.optional(),
  icon: z.string().trim().max(40).nullish(),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true),
});
export const updateCategorySchema = createCategorySchema.partial();
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export interface CategoryDto { id: string; slug: string; name: string; icon: string | null; sortOrder: number; isActive: boolean }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string) => UUID.test(v);

const toDto = (c: { id: string; slug: string; name: string; icon: string | null; sortOrder: number; isActive: boolean }): CategoryDto => ({
  id: c.id, slug: c.slug, name: c.name, icon: c.icon, sortOrder: c.sortOrder, isActive: c.isActive,
});
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

export async function listCategories(deps: Deps, ctx: AuthContext | null, includeInactive: boolean): Promise<CategoryDto[]> {
  const showAll = includeInactive && !!ctx && canManage(ctx);
  const rows = await deps.db.category.findMany({ where: showAll ? {} : { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return rows.map(toDto);
}

const canManage = (ctx: AuthContext) => ctx.roles.includes("EDITOR") || ctx.roles.includes("ADMIN");

export async function getCategory(deps: Deps, ctx: AuthContext | null, idOrSlug: string): Promise<CategoryDto> {
  const row = await deps.db.category.findFirst({ where: isUuid(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug } });
  if (!row || (!row.isActive && !(ctx && canManage(ctx)))) throw Errors.notFound("Category");
  return toDto(row);
}

export async function createCategory(deps: Deps, ctx: AuthContext, input: CreateCategoryInput): Promise<CategoryDto> {
  requirePermission(ctx, "category:manage");
  try {
    return await deps.db.$transaction(async (tx) => {
      const row = await tx.category.create({
        data: { name: input.name, slug: input.slug ?? slugify(input.name, 60), icon: input.icon ?? null, sortOrder: input.sortOrder, isActive: input.isActive },
      });
      await writeAudit(tx, { actorId: ctx.id, action: "category.create", entityType: "Category", entityId: row.id, metadata: { slug: row.slug } });
      return toDto(row);
    });
  } catch (e) {
    if (isUnique(e)) throw Errors.conflict("A category with this slug already exists");
    throw e;
  }
}

export async function updateCategory(deps: Deps, ctx: AuthContext, id: string, input: UpdateCategoryInput): Promise<CategoryDto> {
  requirePermission(ctx, "category:manage");
  try {
    return await deps.db.$transaction(async (tx) => {
      const exists = await tx.category.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw Errors.notFound("Category");
      const row = await tx.category.update({ where: { id }, data: { ...input, icon: input.icon === undefined ? undefined : input.icon } });
      await writeAudit(tx, { actorId: ctx.id, action: "category.update", entityType: "Category", entityId: id, metadata: { fields: Object.keys(input) } });
      return toDto(row);
    });
  } catch (e) {
    if (isUnique(e)) throw Errors.conflict("A category with this slug already exists");
    throw e;
  }
}

export async function deleteCategory(deps: Deps, ctx: AuthContext, id: string): Promise<void> {
  requirePermission(ctx, "category:manage");
  await deps.db.$transaction(async (tx) => {
    const cat = await tx.category.findUnique({ where: { id }, select: { id: true, slug: true } });
    if (!cat) throw Errors.notFound("Category");
    const used = await tx.article.count({ where: { categoryId: id } });
    if (used > 0) throw Errors.conflict(`Category has ${used} article(s). Deactivate it instead of deleting.`);
    await tx.category.delete({ where: { id } });
    await writeAudit(tx, { actorId: ctx.id, action: "category.delete", entityType: "Category", entityId: id, metadata: { slug: cat.slug } });
  });
}
