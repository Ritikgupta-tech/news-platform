import { z } from "zod";
import { Errors } from "@/lib/api/errors";
import { buildPageMeta, toSkipTake } from "@/lib/api/pagination";
import { detailInclude, liveWhere, toListItem } from "@/server/articles/service";
import type { Deps } from "@/server/container";
import { readPrefs } from "./preferences";
import { pageQuery } from "./bookmarks";

export const MAX_HISTORY = 500;
export const recordSchema = z.object({ articleId: z.string().uuid() });

/** Records (or refreshes) that the user read an article. Honours the user's "keep a reading history" setting. */
export async function recordRead(deps: Deps, userId: string, articleId: string): Promise<{ recorded: boolean }> {
  const user = await deps.db.user.findFirst({ where: { id: userId, deletedAt: null }, select: { preferences: true } });
  if (!user) throw Errors.unauthenticated();
  if (!readPrefs(user.preferences).recordReadingHistory) return { recorded: false };
  const article = await deps.db.article.findFirst({ where: { id: articleId, ...liveWhere(deps.now()) }, select: { id: true } });
  if (!article) throw Errors.notFound("Article");
  const now = deps.now();
  await deps.db.$transaction(async (tx) => {
    await tx.readingHistory.upsert({ where: { userId_articleId: { userId, articleId } }, update: { lastReadAt: now }, create: { userId, articleId, lastReadAt: now } });
    const total = await tx.readingHistory.count({ where: { userId } });
    if (total > MAX_HISTORY) {
      const oldest = await tx.readingHistory.findMany({ where: { userId }, orderBy: { lastReadAt: "asc" }, take: total - MAX_HISTORY, select: { articleId: true } });
      await tx.readingHistory.deleteMany({ where: { userId, articleId: { in: oldest.map((o) => o.articleId) } } });
    }
  });
  return { recorded: true };
}

export async function listHistory(deps: Deps, userId: string, q: z.infer<typeof pageQuery>) {
  const where = { userId, article: liveWhere(deps.now()) };
  const [total, rows] = await Promise.all([
    deps.db.readingHistory.count({ where }),
    deps.db.readingHistory.findMany({ where, orderBy: { lastReadAt: "desc" }, ...toSkipTake(q), include: { article: { include: detailInclude } } }),
  ]);
  return { items: rows.map((r) => ({ ...toListItem(r.article), lastReadAt: r.lastReadAt.toISOString() })), meta: buildPageMeta(q, total) };
}

export async function removeHistoryItem(deps: Deps, userId: string, articleId: string): Promise<{ removed: number }> {
  return { removed: (await deps.db.readingHistory.deleteMany({ where: { userId, articleId } })).count };
}

export async function clearHistory(deps: Deps, userId: string): Promise<{ removed: number }> {
  return { removed: (await deps.db.readingHistory.deleteMany({ where: { userId } })).count };
}
