import { Prisma, type ArticleStatus } from "@prisma/client";
import { ApiError, Errors } from "@/lib/api/errors";
import { buildPageMeta, toSkipTake } from "@/lib/api/pagination";
import { can } from "@/lib/permissions";
import { readingMinutes } from "@/lib/reading-time";
import { slugify, withSuffix } from "@/lib/slug";
import { assertVersion } from "@/lib/workflow";
import { writeAudit } from "@/server/audit/audit";
import type { AuthContext } from "@/server/auth/guard";
import type { Deps } from "@/server/container";
import { htmlToText, sanitizeArticleHtml } from "@/server/content/sanitize";
import { canViewUnpublished, decideDelete, decideEdit } from "./policy";
import type { CreateArticleInput, ListArticlesQuery, UpdateArticleInput } from "./validation";

type Tx = Prisma.TransactionClient;

export const detailInclude = {
  category: { select: { id: true, slug: true, name: true } },
  author: { select: { id: true, name: true, authorProfile: { select: { slug: true } } } },
  tags: { select: { tag: { select: { slug: true, name: true } } } },
} satisfies Prisma.ArticleInclude;
export type ArticleRow = Prisma.ArticleGetPayload<{ include: typeof detailInclude }>;

export interface ArticleListItemDto {
  id: string; slug: string; title: string; subtitle: string | null; summary: string; status: ArticleStatus; version: number;
  readingMinutes: number; isBreaking: boolean;
  category: { id: string; slug: string; name: string };
  author: { id: string; name: string; slug: string | null };
  tags: { slug: string; name: string }[];
  heroImageId: string | null; scheduledFor: string | null; publishedAt: string | null; createdAt: string; updatedAt: string;
}
export interface ArticleDto extends ArticleListItemDto { bodyHtml: string; sourceName: string | null; sourceUrl: string | null }

export const toListItem = (a: ArticleRow): ArticleListItemDto => ({
  id: a.id, slug: a.slug, title: a.title, subtitle: a.subtitle, summary: a.summary, status: a.status, version: a.version,
  readingMinutes: a.readingMinutes, isBreaking: a.isBreaking,
  category: a.category,
  author: { id: a.author.id, name: a.author.name, slug: a.author.authorProfile?.slug ?? null },
  tags: a.tags.map((t) => t.tag).sort((x, y) => x.name.localeCompare(y.name)), // stable order (the join table keeps none)
  heroImageId: a.heroImageId,
  scheduledFor: a.scheduledFor?.toISOString() ?? null, publishedAt: a.publishedAt?.toISOString() ?? null,
  createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString(),
});
const toDto = (a: ArticleRow): ArticleDto => ({ ...toListItem(a), bodyHtml: a.bodyHtml, sourceName: a.sourceName, sourceUrl: a.sourceUrl });

/** Where-clause for articles readers may see: published, not deleted, publication time reached. */
export const liveWhere = (now: Date): Prisma.ArticleWhereInput => ({ status: "PUBLISHED", deletedAt: null, publishedAt: { lte: now } });

const validation = (path: string, message: string) => new ApiError(422, "VALIDATION_ERROR", message, [{ path, message }]);

async function assertCategory(tx: Tx | Deps["db"], categoryId: string) {
  const c = await tx.category.findUnique({ where: { id: categoryId }, select: { isActive: true } });
  if (!c || !c.isActive) throw validation("categoryId", "Unknown or inactive category");
}

async function assertHeroImage(tx: Tx | Deps["db"], id: string | null | undefined) {
  if (!id) return;
  const m = await tx.mediaAsset.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!m) throw validation("heroImageId", "Unknown image");
}

/** Upserts tags by slug and returns their ids. Authors may introduce new tags through articles. */
async function resolveTagIds(tx: Tx, names: string[]): Promise<string[]> {
  const bySlug = new Map<string, string>();
  for (const n of names) {
    const slug = slugify(n, 50);
    if (!bySlug.has(slug)) bySlug.set(slug, n);
  }
  const ids: string[] = [];
  for (const [slug, name] of bySlug) {
    const tag = await tx.tag.upsert({ where: { slug }, update: {}, create: { slug, name } });
    ids.push(tag.id);
  }
  return ids;
}

async function uniqueSlug(tx: Tx, title: string): Promise<string> {
  const base = slugify(title);
  for (let n = 1; n < 50; n++) {
    const candidate = withSuffix(base, n);
    if (!(await tx.article.findUnique({ where: { slug: candidate }, select: { id: true } }))) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

function processBody(bodyHtml: string) {
  const clean = sanitizeArticleHtml(bodyHtml);
  const text = htmlToText(clean);
  if (!text) throw validation("bodyHtml", "Article body is empty after sanitization");
  return { bodyHtml: clean, bodyText: text, readingMinutes: readingMinutes(text) };
}

export async function createArticle(deps: Deps, ctx: AuthContext, input: CreateArticleInput): Promise<ArticleDto> {
  if (!can(ctx.roles, "article:create")) throw Errors.forbidden();
  const body = processBody(input.bodyHtml);
  for (let attempt = 0; ; attempt++) {
    try {
      const id = await deps.db.$transaction(async (tx) => {
        await assertCategory(tx, input.categoryId);
        await assertHeroImage(tx, input.heroImageId);
        const tagIds = await resolveTagIds(tx, input.tags);
        const article = await tx.article.create({
          data: {
            slug: await uniqueSlug(tx, input.title),
            title: input.title, subtitle: input.subtitle ?? null, summary: input.summary,
            ...body,
            status: "DRAFT", version: 1,
            authorId: ctx.id, categoryId: input.categoryId, heroImageId: input.heroImageId ?? null,
            sourceName: input.sourceName ?? null, sourceUrl: input.sourceUrl ?? null,
            tags: { create: tagIds.map((tagId) => ({ tagId })) },
          },
        });
        await tx.articleRevision.create({
          data: { articleId: article.id, version: 1, title: article.title, summary: article.summary, bodyHtml: article.bodyHtml, editedById: ctx.id, changeNote: "Created" },
        });
        await writeAudit(tx, { actorId: ctx.id, action: "article.create", entityType: "Article", entityId: article.id });
        return article.id;
      });
      return toDto(await deps.db.article.findUniqueOrThrow({ where: { id }, include: detailInclude }));
    } catch (e) {
      if (isUniqueViolation(e) && attempt < 3) continue; // slug/tag race with a concurrent create
      throw e;
    }
  }
}

export async function updateArticle(deps: Deps, ctx: AuthContext, id: string, input: UpdateArticleInput): Promise<ArticleDto> {
  const existing = await deps.db.article.findFirst({ where: { id, deletedAt: null }, select: { authorId: true, status: true, version: true } });
  if (!existing) throw Errors.notFound("Article");
  const decision = decideEdit(ctx, existing);
  if (!decision.ok) {
    if (decision.reason === "not_found") throw Errors.notFound("Article");
    throw Errors.conflict(`Article cannot be edited while it is ${existing.status}`);
  }
  assertVersion(existing.version, input.version);

  const data: Prisma.ArticleUncheckedUpdateManyInput = {};
  // Approval (and any schedule) applies to the exact version that was reviewed: editing sends it back to review.
  const approvalReset = existing.status === "APPROVED" || existing.status === "SCHEDULED";
  if (approvalReset) {
    data.status = "IN_REVIEW";
    data.scheduledFor = null;
  }
  if (input.title !== undefined) data.title = input.title;
  if (input.subtitle !== undefined) data.subtitle = input.subtitle;
  if (input.summary !== undefined) data.summary = input.summary;
  if (input.categoryId !== undefined) data.categoryId = input.categoryId;
  if (input.heroImageId !== undefined) data.heroImageId = input.heroImageId;
  if (input.sourceName !== undefined) data.sourceName = input.sourceName;
  if (input.sourceUrl !== undefined) data.sourceUrl = input.sourceUrl;
  if (input.bodyHtml !== undefined) Object.assign(data, processBody(input.bodyHtml));

  await deps.db.$transaction(async (tx) => {
    if (input.categoryId !== undefined) await assertCategory(tx, input.categoryId);
    if (input.heroImageId !== undefined) await assertHeroImage(tx, input.heroImageId);
    // Compare-and-set: succeeds only if nobody saved since the client loaded `version`.
    const res = await tx.article.updateMany({
      where: { id, version: input.version, deletedAt: null },
      data: { ...data, version: { increment: 1 } },
    });
    if (res.count !== 1) {
      const current = await tx.article.findUnique({ where: { id }, select: { version: true } });
      throw Errors.versionConflict(current?.version ?? input.version);
    }
    if (input.tags !== undefined) {
      const tagIds = await resolveTagIds(tx, input.tags);
      await tx.articleTag.deleteMany({ where: { articleId: id } });
      if (tagIds.length) await tx.articleTag.createMany({ data: tagIds.map((tagId) => ({ articleId: id, tagId })) });
    }
    const fresh = await tx.article.findUniqueOrThrow({ where: { id } });
    await tx.articleRevision.create({
      data: { articleId: id, version: fresh.version, title: fresh.title, summary: fresh.summary, bodyHtml: fresh.bodyHtml, editedById: ctx.id, changeNote: input.changeNote ?? null },
    });
    await writeAudit(tx, { actorId: ctx.id, action: "article.update", entityType: "Article", entityId: id, metadata: { version: fresh.version, ...(approvalReset ? { approvalReset: true, previousStatus: existing.status } : {}) } });
  });
  return toDto(await deps.db.article.findUniqueOrThrow({ where: { id }, include: detailInclude }));
}

export async function deleteArticle(deps: Deps, ctx: AuthContext, id: string): Promise<void> {
  const existing = await deps.db.article.findFirst({ where: { id, deletedAt: null }, select: { authorId: true, status: true } });
  if (!existing) throw Errors.notFound("Article");
  const d = decideDelete(ctx, existing);
  if (!d.ok) {
    if (d.reason === "not_found") throw Errors.notFound("Article");
    throw Errors.conflict(`Only draft articles can be deleted by their author (this one is ${existing.status})`);
  }
  await deps.db.$transaction(async (tx) => {
    await tx.article.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: deps.now() } });
    await writeAudit(tx, { actorId: ctx.id, action: "article.delete", entityType: "Article", entityId: id });
  });
}

export async function getArticleForActor(deps: Deps, ctx: AuthContext | null, id: string): Promise<ArticleDto> {
  const row = await deps.db.article.findFirst({ where: { id, deletedAt: null }, include: detailInclude });
  if (!row) throw Errors.notFound("Article");
  const live = row.status === "PUBLISHED" && row.publishedAt !== null && row.publishedAt <= deps.now();
  if (!live && !(ctx && canViewUnpublished(ctx, row))) throw Errors.notFound("Article");
  return toDto(row);
}

export async function fetchArticleDto(db: Deps["db"], id: string): Promise<ArticleDto> {
  return toDto(await db.article.findUniqueOrThrow({ where: { id }, include: detailInclude }));
}

export async function getPublishedBySlug(deps: Deps, slug: string): Promise<ArticleDto> {
  const row = await deps.db.article.findFirst({
    where: { slug, status: "PUBLISHED", deletedAt: null, publishedAt: { lte: deps.now() } },
    include: detailInclude,
  });
  if (!row) throw Errors.notFound("Article");
  return toDto(row);
}

export async function listArticles(deps: Deps, ctx: AuthContext | null, q: ListArticlesQuery) {
  const where: Prisma.ArticleWhereInput = { deletedAt: null };
  if (q.scope === "public") {
    where.status = "PUBLISHED";
    where.publishedAt = { lte: deps.now() };
  } else {
    if (!ctx) throw Errors.unauthenticated();
    if (q.scope === "mine") where.authorId = ctx.id;
    if (q.scope === "review") {
      if (!can(ctx.roles, "article:review")) throw Errors.forbidden();
      where.status = { in: ["SUBMITTED", "IN_REVIEW"] };
    }
    if (q.scope === "all" && !can(ctx.roles, "article:edit_any")) throw Errors.forbidden();
    if (q.status && q.scope !== "review") where.status = q.status;
  }
  if (q.category) where.category = { slug: q.category };
  if (q.tag) where.tags = { some: { tag: { slug: q.tag } } };
  if (q.author) where.author = { authorProfile: { slug: q.author } };

  const [total, rows] = await Promise.all([
    deps.db.article.count({ where }),
    deps.db.article.findMany({
      where, include: detailInclude, ...toSkipTake(q),
      orderBy: q.scope === "public" ? { publishedAt: "desc" } : { updatedAt: "desc" },
    }),
  ]);
  return { items: rows.map(toListItem), meta: buildPageMeta(q, total) };
}
