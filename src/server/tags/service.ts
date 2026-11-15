import { Prisma } from "@prisma/client";
import { z } from "zod";
import { Errors } from "@/lib/api/errors";
import { buildPageMeta, paginationSchema, toSkipTake } from "@/lib/api/pagination";
import { slugify } from "@/lib/slug";
import { writeAudit } from "@/server/audit/audit";
import { requirePermission, type AuthContext } from "@/server/auth/guard";
import type { Deps } from "@/server/container";

export const listTagsQuery = paginationSchema.extend({ q: z.string().trim().max(60).optional() });
export const createTagSchema = z.object({
  name: z.string().trim().min(2).max(40),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(50).optional(),
});
export const updateTagSchema = createTagSchema.partial();

export interface TagDto { id: string; slug: string; name: string; articleCount: number }
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

export async function listTags(deps: Deps, q: z.infer<typeof listTagsQuery>) {
  const where: Prisma.TagWhereInput = q.q ? { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { slug: { contains: slugify(q.q, 50) } }] } : {};
  const [total, rows] = await Promise.all([
    deps.db.tag.count({ where }),
    deps.db.tag.findMany({ where, orderBy: { name: "asc" }, ...toSkipTake(q), include: { _count: { select: { articles: true } } } }),
  ]);
  const items: TagDto[] = rows.map((t) => ({ id: t.id, slug: t.slug, name: t.name, articleCount: t._count.articles }));
  return { items, meta: buildPageMeta(q, total) };
}

export async function createTag(deps: Deps, ctx: AuthContext, input: z.infer<typeof createTagSchema>): Promise<TagDto> {
  requirePermission(ctx, "tag:manage");
  try {
    return await deps.db.$transaction(async (tx) => {
      const t = await tx.tag.create({ data: { name: input.name, slug: input.slug ?? slugify(input.name, 50) } });
      await writeAudit(tx, { actorId: ctx.id, action: "tag.create", entityType: "Tag", entityId: t.id });
      return { id: t.id, slug: t.slug, name: t.name, articleCount: 0 };
    });
  } catch (e) {
    if (isUnique(e)) throw Errors.conflict("A tag with this slug already exists");
    throw e;
  }
}

export async function updateTag(deps: Deps, ctx: AuthContext, id: string, input: z.infer<typeof updateTagSchema>): Promise<TagDto> {
  requirePermission(ctx, "tag:manage");
  try {
    return await deps.db.$transaction(async (tx) => {
      if (!(await tx.tag.findUnique({ where: { id }, select: { id: true } }))) throw Errors.notFound("Tag");
      const t = await tx.tag.update({ where: { id }, data: input, include: { _count: { select: { articles: true } } } });
      await writeAudit(tx, { actorId: ctx.id, action: "tag.update", entityType: "Tag", entityId: id });
      return { id: t.id, slug: t.slug, name: t.name, articleCount: t._count.articles };
    });
  } catch (e) {
    if (isUnique(e)) throw Errors.conflict("A tag with this slug already exists");
    throw e;
  }
}

export async function deleteTag(deps: Deps, ctx: AuthContext, id: string): Promise<void> {
  requirePermission(ctx, "tag:manage");
  await deps.db.$transaction(async (tx) => {
    if (!(await tx.tag.findUnique({ where: { id }, select: { id: true } }))) throw Errors.notFound("Tag");
    await tx.tag.delete({ where: { id } }); // ArticleTag rows cascade
    await writeAudit(tx, { actorId: ctx.id, action: "tag.delete", entityType: "Tag", entityId: id });
  });
}
