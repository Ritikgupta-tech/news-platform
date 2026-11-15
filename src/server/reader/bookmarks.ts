import { z } from "zod";
import { Errors } from "@/lib/api/errors";
import { buildPageMeta, paginationSchema, toSkipTake } from "@/lib/api/pagination";
import { detailInclude, liveWhere, toListItem } from "@/server/articles/service";
import type { Deps } from "@/server/container";

export const MAX_BOOKMARKS = 500;
export const bookmarkSchema = z.object({ articleId: z.string().uuid() });
export const pageQuery = paginationSchema;

/** Stored with the bookmark so ranking can later count real saves (one row per user per article). */
const engagementKey = (userId: string) => `u:${userId}`;

export async function addBookmark(deps: Deps, userId: string, articleId: string): Promise<{ bookmarked: true }> {
  const article = await deps.db.article.findFirst({ where: { id: articleId, ...liveWhere(deps.now()) }, select: { id: true } });
  if (!article) throw Errors.notFound("Article");
  await deps.db.$transaction(async (tx) => {
    const exists = await tx.bookmark.findUnique({ where: { userId_articleId: { userId, articleId } } });
    if (exists) return; // idempotent
    if ((await tx.bookmark.count({ where: { userId } })) >= MAX_BOOKMARKS) throw Errors.conflict(`You can save up to ${MAX_BOOKMARKS} articles. Remove some first.`);
    await tx.bookmark.create({ data: { userId, articleId } });
    await tx.articleEngagement.createMany({ data: [{ articleId, viewerKey: engagementKey(userId), type: "BOOKMARK" }], skipDuplicates: true });
  });
  return { bookmarked: true };
}

/** Only ever removes the caller's own bookmark. Idempotent. */
export async function removeBookmark(deps: Deps, userId: string, articleId: string): Promise<{ bookmarked: false }> {
  await deps.db.$transaction([
    deps.db.bookmark.deleteMany({ where: { userId, articleId } }),
    deps.db.articleEngagement.deleteMany({ where: { articleId, viewerKey: engagementKey(userId), type: "BOOKMARK" } }),
  ]);
  return { bookmarked: false };
}

export async function isBookmarked(deps: Deps, userId: string, articleId: string): Promise<boolean> {
  return (await deps.db.bookmark.count({ where: { userId, articleId } })) > 0;
}

export async function listBookmarks(deps: Deps, userId: string, q: z.infer<typeof pageQuery>) {
  const where = { userId, article: liveWhere(deps.now()) };
  const [total, rows] = await Promise.all([
    deps.db.bookmark.count({ where }),
    deps.db.bookmark.findMany({ where, orderBy: { createdAt: "desc" }, ...toSkipTake(q), include: { article: { include: detailInclude } } }),
  ]);
  return { items: rows.map((r) => ({ ...toListItem(r.article), bookmarkedAt: r.createdAt.toISOString() })), meta: buildPageMeta(q, total) };
}
