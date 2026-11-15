import { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError, Errors } from "@/lib/api/errors";
import { writeAudit } from "@/server/audit/audit";
import { requirePermission, type AuthContext } from "@/server/auth/guard";
import type { Deps } from "@/server/container";

export const SLOTS = ["HERO", "FEATURED"] as const;
export type Slot = (typeof SLOTS)[number];
export const SLOT_LIMITS: Record<Slot, number> = { HERO: 5, FEATURED: 3 };
export const PROMO_KEY = "homepage.promo";

export const slotSchema = z.enum(SLOTS);
export const setSlotSchema = z.object({ articleIds: z.array(z.string().uuid()).max(5) });

/** Same rule the public repository applies: a same-site path, or https. */
const safeHref = (v: string) => (v.startsWith("/") && !v.startsWith("//")) || v.startsWith("https://");
export const promoSchema = z.object({
  eyebrow: z.string().trim().max(40).optional(),
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().max(240).optional(),
  ctaLabel: z.string().trim().min(2).max(40),
  ctaHref: z.string().trim().max(500).refine(safeHref, "Use a site path such as /newsletter or a link starting with https://"),
});
export type PromoInput = z.infer<typeof promoSchema>;

export interface PinnedArticle { id: string; title: string; slug: string; live: boolean; publishedAt: string | null }
export interface HomepageConfigDto {
  slots: Record<Slot, PinnedArticle[]>;
  candidates: PinnedArticle[];
  promo: PromoInput | null;
}

const select = { id: true, title: true, slug: true, status: true, deletedAt: true, publishedAt: true } satisfies Prisma.ArticleSelect;
type Row = Prisma.ArticleGetPayload<{ select: typeof select }>;
const toPinned = (a: Row, now: Date): PinnedArticle => ({
  id: a.id, title: a.title, slug: a.slug,
  live: a.status === "PUBLISHED" && !a.deletedAt && !!a.publishedAt && a.publishedAt <= now,
  publishedAt: a.publishedAt?.toISOString() ?? null,
});

export async function getHomepageConfig(deps: Deps, ctx: AuthContext): Promise<HomepageConfigDto> {
  requirePermission(ctx, "featured:manage");
  const now = deps.now();
  const pins = await deps.db.featuredStory.findMany({ orderBy: { position: "asc" }, include: { article: { select: select } } });
  const slots: Record<Slot, PinnedArticle[]> = { HERO: [], FEATURED: [] };
  for (const p of pins) if (p.slot === "HERO" || p.slot === "FEATURED") slots[p.slot].push(toPinned(p.article, now));
  const pinnedIds = pins.map((p) => p.articleId);
  const cands = await deps.db.article.findMany({
    where: { status: "PUBLISHED", deletedAt: null, publishedAt: { lte: now }, id: { notIn: pinnedIds } },
    orderBy: { publishedAt: "desc" }, take: 40, select,
  });
  const setting = await deps.db.siteSetting.findUnique({ where: { key: PROMO_KEY } });
  const parsed = promoSchema.safeParse(setting?.value);
  return { slots, candidates: cands.map((a) => toPinned(a, now)), promo: parsed.success ? parsed.data : null };
}

/**
 * Replaces one slot with the given ordered list. An article can sit in only one slot at a time, so an article
 * already pinned elsewhere is moved. Only live published articles may be pinned.
 */
export async function setSlot(deps: Deps, ctx: AuthContext, slot: Slot, articleIds: string[]): Promise<PinnedArticle[]> {
  requirePermission(ctx, "featured:manage");
  if (new Set(articleIds).size !== articleIds.length) throw new ApiError(422, "VALIDATION_ERROR", "An article can only appear once in a slot");
  if (articleIds.length > SLOT_LIMITS[slot]) throw new ApiError(422, "VALIDATION_ERROR", `The ${slot.toLowerCase()} slot holds at most ${SLOT_LIMITS[slot]} stories`);
  try {
    return await deps.db.$transaction(async (tx) => {
      const now = deps.now();
      const rows = await tx.article.findMany({ where: { id: { in: articleIds } }, select });
      if (rows.length !== articleIds.length) throw Errors.notFound("Article");
      const notLive = rows.filter((r) => !toPinned(r, now).live);
      if (notLive.length) throw new ApiError(422, "VALIDATION_ERROR", `Only published stories can be pinned: “${notLive[0]!.title}” is not live`);
      const before = await tx.featuredStory.findMany({ where: { slot }, orderBy: { position: "asc" }, select: { articleId: true } });
      await tx.featuredStory.deleteMany({ where: { OR: [{ slot }, { articleId: { in: articleIds } }] } });
      if (articleIds.length) await tx.featuredStory.createMany({ data: articleIds.map((articleId, position) => ({ articleId, slot, position })) });
      await writeAudit(tx, { actorId: ctx.id, action: "homepage.slot.set", entityType: "Homepage", entityId: slot, metadata: { before: before.map((b) => b.articleId), after: articleIds } });
      const byId = new Map(rows.map((r) => [r.id, toPinned(r, now)]));
      return articleIds.map((id) => byId.get(id)!);
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw Errors.conflict("The homepage was changed by someone else. Reload and try again.");
    throw e;
  }
}

export async function setPromo(deps: Deps, ctx: AuthContext, input: PromoInput | null): Promise<PromoInput | null> {
  requirePermission(ctx, "homepage:manage");
  await deps.db.$transaction(async (tx) => {
    if (input) await tx.siteSetting.upsert({ where: { key: PROMO_KEY }, create: { key: PROMO_KEY, value: input }, update: { value: input } });
    else await tx.siteSetting.deleteMany({ where: { key: PROMO_KEY } });
    await writeAudit(tx, { actorId: ctx.id, action: input ? "homepage.promo.set" : "homepage.promo.clear", entityType: "Homepage", entityId: "promo", metadata: input ? { title: input.title } : undefined });
  });
  return input;
}
