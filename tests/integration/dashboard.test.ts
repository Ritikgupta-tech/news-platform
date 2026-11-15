import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { connect, ctxFor, makeArticle, makeDeps, makeUser, resetDatabase, TEST_DB_URL } from "./helpers";
import { dashboardQuery, getAdminDashboard } from "../../src/server/admin/dashboard";
import { createCategory } from "../../src/server/categories/service";

describe.skipIf(!TEST_DB_URL)("admin dashboard (real Postgres)", () => {
  let db: PrismaClient;
  let deps: ReturnType<typeof makeDeps>;
  beforeAll(() => { db = connect(); });
  beforeEach(async () => { await resetDatabase(db); deps = makeDeps(db); });
  afterAll(async () => { await db.$disconnect(); });

  const as = async (role: "READER" | "AUTHOR" | "EDITOR" | "ADMIN") => ctxFor(db, (await makeUser(db, role)).id);
  const q = dashboardQuery.parse({});

  it("is forbidden to readers and authors, allowed to editors and admins", async () => {
    for (const role of ["READER", "AUTHOR"] as const) await expect(getAdminDashboard(deps, await as(role), q)).rejects.toMatchObject({ status: 403 });
    for (const role of ["EDITOR", "ADMIN"] as const) await expect(getAdminDashboard(deps, await as(role), q)).resolves.toBeTruthy();
  });

  it("reports honest zeros on an empty site", async () => {
    const d = await getAdminDashboard(deps, await as("ADMIN"), q);
    expect(d.articles).toMatchObject({ total: 0, published: 0, drafts: 0, pendingReview: 0 });
    expect(d.views).toEqual({ inRange: 0, total: 0 });
    expect(d.subscribers).toEqual({ active: 0, pending: 0 });
    expect(d.topArticles).toEqual([]);
  });

  it("counts articles by status, ignores deleted ones and ranks views", async () => {
    const author = await makeUser(db, "AUTHOR");
    const a = await makeArticle(db, { authorId: author.id, status: "PUBLISHED", publishedAt: new Date() });
    const b = await makeArticle(db, { authorId: author.id, status: "PUBLISHED", publishedAt: new Date(), categorySlug: "business" });
    await makeArticle(db, { authorId: author.id, status: "DRAFT", publishedAt: null });
    await makeArticle(db, { authorId: author.id, status: "SUBMITTED", publishedAt: null });
    const gone = await makeArticle(db, { authorId: author.id, status: "PUBLISHED", publishedAt: new Date() });
    await db.article.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });

    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    await db.articleView.createMany({ data: [{ articleId: a.id, viewerKey: "v1", viewDate: today }, { articleId: a.id, viewerKey: "v2", viewDate: today }, { articleId: b.id, viewerKey: "v1", viewDate: today }] });

    const d = await getAdminDashboard(deps, await as("EDITOR"), q);
    expect(d.articles).toMatchObject({ total: 4, published: 2, drafts: 1, pendingReview: 1 });
    expect(d.views).toEqual({ inRange: 3, total: 3 });
    expect(d.topArticles.map((t) => [t.id, t.views])).toEqual([[a.id, 2], [b.id, 1]]);
    expect(d.categories.find((c) => c.name === "Technology")).toMatchObject({ published: 1, views: 2 });
  });

  it("limits views to the chosen range", async () => {
    const author = await makeUser(db, "AUTHOR");
    const a = await makeArticle(db, { authorId: author.id });
    const old = new Date(); old.setUTCDate(old.getUTCDate() - 20); old.setUTCHours(0, 0, 0, 0);
    await db.articleView.create({ data: { articleId: a.id, viewerKey: "old", viewDate: old } });
    const admin = await as("ADMIN");
    expect((await getAdminDashboard(deps, admin, dashboardQuery.parse({ days: 7 }))).views).toEqual({ inRange: 0, total: 1 });
    expect((await getAdminDashboard(deps, admin, dashboardQuery.parse({ days: 30 }))).views).toEqual({ inRange: 1, total: 1 });
  });

  it("lists recent audit activity with the actor's name", async () => {
    const editor = await as("EDITOR");
    await createCategory(deps, editor, { name: "Culture", sortOrder: 1, isActive: true });
    const d = await getAdminDashboard(deps, editor, q);
    expect(d.recentActivity[0]).toMatchObject({ action: "category.create", entityType: "Category", actorName: editor.name });
  });

  it("rejects out-of-range day windows", () => {
    expect(() => dashboardQuery.parse({ days: 0 })).toThrow();
    expect(() => dashboardQuery.parse({ days: 1000 })).toThrow();
  });
});
