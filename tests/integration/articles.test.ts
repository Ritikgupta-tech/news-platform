import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { connect, ctxFor, makeArticle, makeDeps, makeUser, resetDatabase, TEST_DB_URL } from "./helpers";
import { createArticle, deleteArticle, getArticleForActor, getPublishedBySlug, listArticles, updateArticle } from "../../src/server/articles/service";
import { listArticlesQuery } from "../../src/server/articles/validation";

describe.skipIf(!TEST_DB_URL)("articles service (real Postgres)", () => {
  let db: PrismaClient;
  let deps: ReturnType<typeof makeDeps>;
  let techId: string;
  beforeAll(() => { db = connect(); });
  beforeEach(async () => {
    await resetDatabase(db);
    deps = makeDeps(db);
    techId = (await db.category.findUniqueOrThrow({ where: { slug: "technology" } })).id;
  });
  afterAll(async () => { await db.$disconnect(); });

  const input = (over: Record<string, unknown> = {}) => ({
    title: "A fresh story about technology", summary: "A short but valid summary.", bodyHtml: "<p>Hello world body text.</p>",
    categoryId: techId, tags: [] as string[], ...over,
  });
  const q = (o: Record<string, unknown> = {}) => listArticlesQuery.parse(o);

  it("creates a DRAFT v1 with sanitized body, unique slug, tags and a first revision", async () => {
    const author = await ctxFor(db, (await makeUser(db, "AUTHOR")).id);
    const a = await createArticle(deps, author, input({ bodyHtml: '<p>Safe</p><script>alert(1)</script><img src=x onerror=alert(1)>', tags: ["AI", "ai", "Open Source"] }));
    expect(a.status).toBe("DRAFT");
    expect(a.version).toBe(1);
    expect(a.bodyHtml).not.toMatch(/script|onerror/i);
    expect(a.tags.map((t) => t.slug).sort()).toEqual(["ai", "open-source"]); // "AI" and "ai" collapse
    expect(a.readingMinutes).toBe(1);
    expect(a.author.id).toBe(author.id);
    const b = await createArticle(deps, author, input());
    expect(b.slug).toBe(`${a.slug}-2`);
    expect(await db.articleRevision.count({ where: { articleId: a.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "article.create" } })).toBe(2);
  });

  it("refuses readers, unknown/inactive categories, empty bodies and unsafe source URLs", async () => {
    const reader = await ctxFor(db, (await makeUser(db, "READER")).id);
    await expect(createArticle(deps, reader, input())).rejects.toMatchObject({ status: 403 });
    const author = await ctxFor(db, (await makeUser(db, "AUTHOR")).id);
    await expect(createArticle(deps, author, input({ categoryId: "00000000-0000-4000-8000-000000000000" }))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await db.category.update({ where: { id: techId }, data: { isActive: false } });
    await expect(createArticle(deps, author, input())).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await db.category.update({ where: { id: techId }, data: { isActive: true } });
    await expect(createArticle(deps, author, input({ bodyHtml: "<script>x</script>" }))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const { createArticleSchema } = await import("../../src/server/articles/validation");
    expect(createArticleSchema.safeParse(input({ sourceUrl: "javascript:alert(1)" })).success).toBe(false);
    expect(createArticleSchema.safeParse(input({ sourceUrl: "https://example.com/story" })).success).toBe(true);
  });

  it("updates with version checks, writes revisions, and recomputes derived fields", async () => {
    const author = await ctxFor(db, (await makeUser(db, "AUTHOR")).id);
    const a = await createArticle(deps, author, input());
    const long = `<p>${"word ".repeat(700)}</p>`;
    const u = await updateArticle(deps, author, a.id, { version: 1, bodyHtml: long, tags: ["Politics"], changeNote: "expanded" });
    expect(u.version).toBe(2);
    expect(u.readingMinutes).toBe(4);
    expect(u.slug).toBe(a.slug); // slug is stable
    expect(u.tags.map((t) => t.slug)).toEqual(["politics"]);
    const revs = await db.articleRevision.findMany({ where: { articleId: a.id }, orderBy: { version: "asc" } });
    expect(revs.map((r) => [r.version, r.changeNote])).toEqual([[1, "Created"], [2, "expanded"]]);
    await expect(updateArticle(deps, author, a.id, { version: 1, title: "Stale write attempt here" })).rejects.toMatchObject({ code: "VERSION_CONFLICT", details: { currentVersion: 2 } });
  });

  it("lets exactly one of two simultaneous saves win (no silent overwrite)", async () => {
    const author = await ctxFor(db, (await makeUser(db, "AUTHOR")).id);
    const editor = await ctxFor(db, (await makeUser(db, "EDITOR")).id);
    const a = await createArticle(deps, author, input());
    const results = await Promise.allSettled([
      updateArticle(deps, author, a.id, { version: 1, title: "Author's version of title" }),
      updateArticle(deps, editor, a.id, { version: 1, title: "Editor's version of title" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "VERSION_CONFLICT" });
    const final = await db.article.findUniqueOrThrow({ where: { id: a.id } });
    expect(final.version).toBe(2);
    expect(await db.articleRevision.count({ where: { articleId: a.id } })).toBe(2);
  });

  it("hides other people's articles (IDOR) and enforces status-based editing", async () => {
    const authorUser = await makeUser(db, "AUTHOR");
    const author = await ctxFor(db, authorUser.id);
    const other = await ctxFor(db, (await makeUser(db, "AUTHOR")).id);
    const editor = await ctxFor(db, (await makeUser(db, "EDITOR")).id);
    const a = await createArticle(deps, author, input());

    await expect(updateArticle(deps, other, a.id, { version: 1, title: "Hijacked headline here" })).rejects.toMatchObject({ status: 404 });
    await expect(getArticleForActor(deps, other, a.id)).rejects.toMatchObject({ status: 404 });
    await expect(getArticleForActor(deps, null, a.id)).rejects.toMatchObject({ status: 404 });
    await expect(deleteArticle(deps, other, a.id)).rejects.toMatchObject({ status: 404 });
    expect((await getArticleForActor(deps, author, a.id)).id).toBe(a.id);
    expect((await getArticleForActor(deps, editor, a.id)).id).toBe(a.id);

    await db.article.update({ where: { id: a.id }, data: { status: "SUBMITTED" } });
    await expect(updateArticle(deps, author, a.id, { version: 1, title: "Edited during review!" })).rejects.toMatchObject({ status: 409 });
    expect((await updateArticle(deps, editor, a.id, { version: 1, title: "Editor fixes the headline" })).title).toBe("Editor fixes the headline");

    await db.article.update({ where: { id: a.id }, data: { status: "CHANGES_REQUESTED" } });
    expect((await updateArticle(deps, author, a.id, { version: 2, summary: "Revised summary after review." })).version).toBe(3);

    await db.article.update({ where: { id: a.id }, data: { status: "ARCHIVED" } });
    await expect(updateArticle(deps, editor, a.id, { version: 3, title: "Cannot edit archived" })).rejects.toMatchObject({ status: 409 });
  });

  it("soft-deletes: authors only their own drafts, admins anything; deleted items vanish", async () => {
    const authorUser = await makeUser(db, "AUTHOR");
    const author = await ctxFor(db, authorUser.id);
    const admin = await ctxFor(db, (await makeUser(db, "ADMIN")).id);
    const d = await createArticle(deps, author, input({ title: "Draft to delete soon" }));
    const s = await createArticle(deps, author, input({ title: "Submitted piece stays" }));
    await db.article.update({ where: { id: s.id }, data: { status: "SUBMITTED" } });

    await expect(deleteArticle(deps, author, s.id)).rejects.toMatchObject({ status: 409 });
    await deleteArticle(deps, author, d.id);
    const row = await db.article.findUniqueOrThrow({ where: { id: d.id } });
    expect(row.deletedAt).not.toBeNull(); // soft delete, data preserved
    await expect(getArticleForActor(deps, author, d.id)).rejects.toMatchObject({ status: 404 });
    await expect(updateArticle(deps, author, d.id, { version: 1, title: "Zombie edit attempt" })).rejects.toMatchObject({ status: 404 });
    await deleteArticle(deps, admin, s.id);
    expect((await listArticles(deps, author, q({ scope: "mine" }))).items).toHaveLength(0);
  });

  it("public reads show only live published articles", async () => {
    const author = await makeUser(db, "AUTHOR");
    const live = await makeArticle(db, { authorId: author.id, title: "Live one", publishedAt: new Date(Date.now() - 1000) });
    const draft = await makeArticle(db, { authorId: author.id, title: "Draft one", status: "DRAFT" });
    const future = await makeArticle(db, { authorId: author.id, title: "Future one", publishedAt: new Date(Date.now() + 3_600_000) });
    const list = await listArticles(deps, null, q());
    expect(list.items.map((i) => i.id)).toEqual([live.id]);
    expect((await getPublishedBySlug(deps, live.slug)).id).toBe(live.id);
    await expect(getPublishedBySlug(deps, draft.slug)).rejects.toMatchObject({ status: 404 });
    await expect(getPublishedBySlug(deps, future.slug)).rejects.toMatchObject({ status: 404 });
    // a published article is readable by id for anyone; a draft is not
    expect((await getArticleForActor(deps, null, live.id)).id).toBe(live.id);
    await expect(getArticleForActor(deps, null, draft.id)).rejects.toMatchObject({ status: 404 });
  });

  it("filters public lists by category, tag and author, with pagination", async () => {
    const a1 = await makeUser(db, "AUTHOR", { name: "Filter Alice" });
    const a2 = await makeUser(db, "AUTHOR", { name: "Filter Bob" });
    const t1 = await makeArticle(db, { authorId: a1.id, categorySlug: "technology", title: "T1" });
    await makeArticle(db, { authorId: a2.id, categorySlug: "business", title: "B1" });
    await makeArticle(db, { authorId: a1.id, categorySlug: "technology", title: "T2" });
    const tag = await db.tag.create({ data: { slug: "ai", name: "AI" } });
    await db.articleTag.create({ data: { articleId: t1.id, tagId: tag.id } });
    expect((await listArticles(deps, null, q({ category: "technology" }))).meta.total).toBe(2);
    expect((await listArticles(deps, null, q({ tag: "ai" }))).items.map((i) => i.id)).toEqual([t1.id]);
    const profile = await db.authorProfile.findUniqueOrThrow({ where: { userId: a2.id } });
    expect((await listArticles(deps, null, q({ author: profile.slug }))).meta.total).toBe(1);
    const page = await listArticles(deps, null, q({ pageSize: 1, page: 2 }));
    expect(page.items).toHaveLength(1);
    expect(page.meta).toMatchObject({ total: 3, totalPages: 3, hasNext: true });
  });

  it("protects non-public scopes by authentication and permission", async () => {
    const authorUser = await makeUser(db, "AUTHOR");
    const author = await ctxFor(db, authorUser.id);
    const editor = await ctxFor(db, (await makeUser(db, "EDITOR")).id);
    const mine = await makeArticle(db, { authorId: authorUser.id, status: "DRAFT", title: "Mine draft" });
    const sub = await makeArticle(db, { authorId: (await makeUser(db, "AUTHOR")).id, status: "SUBMITTED", title: "Waiting for review" });

    await expect(listArticles(deps, null, q({ scope: "mine" }))).rejects.toMatchObject({ status: 401 });
    expect((await listArticles(deps, author, q({ scope: "mine" }))).items.map((i) => i.id)).toEqual([mine.id]);
    await expect(listArticles(deps, author, q({ scope: "review" }))).rejects.toMatchObject({ status: 403 });
    await expect(listArticles(deps, author, q({ scope: "all" }))).rejects.toMatchObject({ status: 403 });
    expect((await listArticles(deps, editor, q({ scope: "review" }))).items.map((i) => i.id)).toEqual([sub.id]);
    expect((await listArticles(deps, editor, q({ scope: "all" }))).meta.total).toBe(2);
  });
});
