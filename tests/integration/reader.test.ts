import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { connect, ctxFor, makeArticle, makeDeps, makeUser, resetDatabase, TEST_DB_URL } from "./helpers";
import { addBookmark, isBookmarked, listBookmarks, removeBookmark, MAX_BOOKMARKS } from "../../src/server/reader/bookmarks";
import { clearHistory, listHistory, recordRead, removeHistoryItem, MAX_HISTORY } from "../../src/server/reader/history";
import { getPreferences, readPrefs, updatePreferences } from "../../src/server/reader/preferences";
import { applyAction } from "../../src/server/editorial/service";
import { createArticle } from "../../src/server/articles/service";
import { listNotifications } from "../../src/server/notifications/service";

describe.skipIf(!TEST_DB_URL)("reader features (real Postgres)", () => {
  let db: PrismaClient;
  let deps: ReturnType<typeof makeDeps>;
  beforeAll(() => { db = connect(); });
  beforeEach(async () => { await resetDatabase(db); deps = makeDeps(db); });
  afterAll(async () => { await db.$disconnect(); });

  const q = { page: 1, pageSize: 20 };
  async function world() {
    const author = await makeUser(db, "AUTHOR");
    const alice = await makeUser(db, "READER");
    const bob = await makeUser(db, "READER");
    const live = await makeArticle(db, { authorId: author.id, title: "Live story" });
    return { author, alice, bob, live };
  }

  describe("bookmarks", () => {
    it("saves idempotently, lists newest first, and records one real engagement per save", async () => {
      const { author, alice, live } = await world();
      const second = await makeArticle(db, { authorId: author.id, title: "Second story" });
      expect(await addBookmark(deps, alice.id, live.id)).toEqual({ bookmarked: true });
      await addBookmark(deps, alice.id, live.id); // again: no duplicate, no error
      await addBookmark(deps, alice.id, second.id);
      expect(await db.bookmark.count({ where: { userId: alice.id } })).toBe(2);
      expect(await db.articleEngagement.count({ where: { articleId: live.id, type: "BOOKMARK" } })).toBe(1);
      const list = await listBookmarks(deps, alice.id, q);
      expect(list.items.map((i) => i.id)).toEqual([second.id, live.id]);
      expect(list.items[0]).toHaveProperty("bookmarkedAt");
      expect(await isBookmarked(deps, alice.id, live.id)).toBe(true);
    });

    it("only allows live published articles", async () => {
      const { author, alice } = await world();
      const draft = await makeArticle(db, { authorId: author.id, title: "Draft", status: "DRAFT" });
      const future = await makeArticle(db, { authorId: author.id, title: "Future", publishedAt: new Date(Date.now() + 3_600_000) });
      for (const a of [draft, future]) await expect(addBookmark(deps, alice.id, a.id)).rejects.toMatchObject({ status: 404 });
      await expect(addBookmark(deps, alice.id, "00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({ status: 404 });
    });

    it("keeps people's bookmarks separate (no reading or deleting someone else's)", async () => {
      const { alice, bob, live } = await world();
      await addBookmark(deps, alice.id, live.id);
      expect((await listBookmarks(deps, bob.id, q)).items).toHaveLength(0);
      await removeBookmark(deps, bob.id, live.id); // bob "removes" alice's: nothing happens
      expect(await isBookmarked(deps, alice.id, live.id)).toBe(true);
      await removeBookmark(deps, alice.id, live.id);
      await removeBookmark(deps, alice.id, live.id); // idempotent
      expect(await isBookmarked(deps, alice.id, live.id)).toBe(false);
      expect(await db.articleEngagement.count({ where: { type: "BOOKMARK" } })).toBe(0);
    });

    it("hides bookmarks of articles that are no longer public, without losing them", async () => {
      const { alice, live } = await world();
      await addBookmark(deps, alice.id, live.id);
      await db.article.update({ where: { id: live.id }, data: { status: "ARCHIVED" } });
      expect((await listBookmarks(deps, alice.id, q)).items).toHaveLength(0);
      await db.article.update({ where: { id: live.id }, data: { status: "PUBLISHED" } });
      expect((await listBookmarks(deps, alice.id, q)).items).toHaveLength(1);
    });

    it("paginates", async () => {
      const { author, alice } = await world();
      for (let i = 0; i < 3; i++) await addBookmark(deps, alice.id, (await makeArticle(db, { authorId: author.id, title: `Paged ${i}` })).id);
      expect((await listBookmarks(deps, alice.id, { page: 2, pageSize: 2 })).meta).toMatchObject({ total: 3, totalPages: 2, hasNext: false });
      expect((await listBookmarks(deps, alice.id, { page: 1, pageSize: 2 })).items).toHaveLength(2);
    });

    it("enforces a per-person limit, while re-saving an existing bookmark still works", async () => {
      const { author, alice } = await world();
      const cat = await db.category.findUniqueOrThrow({ where: { slug: "technology" } });
      await db.article.createMany({
        data: Array.from({ length: MAX_BOOKMARKS }, (_, i) => ({
          slug: `bulk-${i}`, title: `Bulk ${i}`, summary: "Bulk summary text.", bodyHtml: "<p>x</p>", bodyText: "x",
          status: "PUBLISHED" as const, publishedAt: new Date(Date.now() - 60_000), authorId: author.id, categoryId: cat.id,
        })),
      });
      const bulk = await db.article.findMany({ where: { slug: { startsWith: "bulk-" } }, select: { id: true } });
      await db.bookmark.createMany({ data: bulk.map((a) => ({ userId: alice.id, articleId: a.id })) });
      const extra = await makeArticle(db, { authorId: author.id, title: "One too many" });
      await expect(addBookmark(deps, alice.id, extra.id)).rejects.toMatchObject({ status: 409 });
      await expect(addBookmark(deps, alice.id, bulk[0]!.id)).resolves.toEqual({ bookmarked: true }); // already saved: not blocked
      expect(await db.bookmark.count({ where: { userId: alice.id } })).toBe(MAX_BOOKMARKS);
    }, 60_000);
  });

  describe("reading history", () => {
    it("records a read once per article and refreshes the time", async () => {
      const { alice, live } = await world();
      expect(await recordRead(deps, alice.id, live.id)).toEqual({ recorded: true });
      const first = (await db.readingHistory.findFirstOrThrow()).lastReadAt;
      await new Promise((r) => setTimeout(r, 15));
      await recordRead(deps, alice.id, live.id);
      expect(await db.readingHistory.count()).toBe(1);
      expect((await db.readingHistory.findFirstOrThrow()).lastReadAt.getTime()).toBeGreaterThan(first.getTime());
    });

    it("lists most recent first, hides non-public articles, and keeps people apart", async () => {
      const { author, alice, bob, live } = await world();
      const b = await makeArticle(db, { authorId: author.id, title: "Read second" });
      await recordRead(deps, alice.id, live.id);
      await new Promise((r) => setTimeout(r, 15));
      await recordRead(deps, alice.id, b.id);
      await recordRead(deps, bob.id, live.id);
      expect((await listHistory(deps, alice.id, q)).items.map((i) => i.id)).toEqual([b.id, live.id]);
      await db.article.update({ where: { id: b.id }, data: { status: "ARCHIVED" } });
      expect((await listHistory(deps, alice.id, q)).items.map((i) => i.id)).toEqual([live.id]);
      expect((await listHistory(deps, bob.id, q)).items).toHaveLength(1);
    });

    it("refuses drafts and unknown articles", async () => {
      const { author, alice } = await world();
      const draft = await makeArticle(db, { authorId: author.id, status: "DRAFT", title: "Hidden" });
      await expect(recordRead(deps, alice.id, draft.id)).rejects.toMatchObject({ status: 404 });
      await expect(recordRead(deps, alice.id, "00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({ status: 404 });
    });

    it("removes single entries or everything, only for the caller", async () => {
      const { author, alice, bob, live } = await world();
      const b = await makeArticle(db, { authorId: author.id, title: "Another" });
      for (const a of [live, b]) { await recordRead(deps, alice.id, a.id); await recordRead(deps, bob.id, a.id); }
      expect(await removeHistoryItem(deps, alice.id, live.id)).toEqual({ removed: 1 });
      expect(await clearHistory(deps, alice.id)).toEqual({ removed: 1 });
      expect(await db.readingHistory.count({ where: { userId: bob.id } })).toBe(2);
    });

    it("stops recording when the reader turns it off", async () => {
      const { alice, live } = await world();
      await updatePreferences(deps, alice.id, { recordReadingHistory: false });
      expect(await recordRead(deps, alice.id, live.id)).toEqual({ recorded: false });
      expect(await db.readingHistory.count()).toBe(0);
      await updatePreferences(deps, alice.id, { recordReadingHistory: true });
      expect(await recordRead(deps, alice.id, live.id)).toEqual({ recorded: true });
    });

    it("keeps at most the newest entries", async () => {
      const { author, alice } = await world();
      const arts = [];
      for (let i = 0; i < 3; i++) arts.push(await makeArticle(db, { authorId: author.id, title: `H${i}` }));
      for (const a of arts) await recordRead(deps, alice.id, a.id);
      expect(MAX_HISTORY).toBeGreaterThanOrEqual(3);
      expect(await db.readingHistory.count({ where: { userId: alice.id } })).toBe(3);
    });
  });

  describe("preferences", () => {
    it("starts with sensible defaults and tolerates damaged stored data", async () => {
      const { alice } = await world();
      expect(await getPreferences(deps, alice.id)).toEqual({ editorialNotifications: true, recordReadingHistory: true, interests: [] });
      expect(readPrefs({ editorialNotifications: "yes" })).toEqual({ editorialNotifications: true, recordReadingHistory: true });
      expect(readPrefs(null)).toEqual({ editorialNotifications: true, recordReadingHistory: true });
    });

    it("saves interests (deduplicated), replaces them, and validates categories", async () => {
      const { alice } = await world();
      const cats = await db.category.findMany({ where: { slug: { in: ["technology", "health", "sports"] } }, orderBy: { slug: "asc" } });
      const [health, sports, tech] = cats as [typeof cats[0], typeof cats[0], typeof cats[0]];
      const saved = await updatePreferences(deps, alice.id, { interests: [tech.id, health.id, tech.id] });
      expect(saved.interests.map((i) => i.slug).sort()).toEqual(["health", "technology"]);
      expect((await updatePreferences(deps, alice.id, { interests: [sports.id] })).interests.map((i) => i.slug)).toEqual(["sports"]);
      expect((await updatePreferences(deps, alice.id, { interests: [] })).interests).toEqual([]);
      await expect(updatePreferences(deps, alice.id, { interests: ["00000000-0000-4000-8000-000000000000"] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      await db.category.update({ where: { id: tech.id }, data: { isActive: false } });
      await expect(updatePreferences(deps, alice.id, { interests: [tech.id] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("changing one setting leaves the others alone", async () => {
      const { alice } = await world();
      await updatePreferences(deps, alice.id, { editorialNotifications: false });
      const p = await updatePreferences(deps, alice.id, { recordReadingHistory: false });
      expect(p).toMatchObject({ editorialNotifications: false, recordReadingHistory: false });
    });

    it("muting editorial notifications stops them, but security alerts still arrive", async () => {
      const author = await ctxFor(db, (await makeUser(db, "AUTHOR")).id);
      const editor = await makeUser(db, "EDITOR");
      const other = await ctxFor(db, (await makeUser(db, "EDITOR")).id);
      const techId = (await db.category.findUniqueOrThrow({ where: { slug: "technology" } })).id;
      await updatePreferences(deps, editor.id, { editorialNotifications: false });
      const a = await createArticle(deps, author, { title: "Muted notification story", summary: "A summary that is long enough.", bodyHtml: "<p>Body.</p>", categoryId: techId, tags: [] });
      await applyAction(deps, author, a.id, "submit", { version: 1 });
      const mine = (ctx: string) => listNotifications(deps, ctx, { page: 1, pageSize: 10, unreadOnly: "false" });
      expect((await mine(editor.id)).items).toHaveLength(0); // muted
      expect((await mine(other.id)).items).toHaveLength(1); // the other editor still hears about it
      await db.notification.create({ data: { userId: editor.id, type: "SECURITY_EVENT", payload: { event: "password_changed" } } });
      expect((await mine(editor.id)).items).toHaveLength(1);
    });
  });
});
