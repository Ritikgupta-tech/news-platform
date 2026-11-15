import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { connect, ctxFor, makeArticle, makeClock, makeDeps, makeUser, resetDatabase, TEST_DB_URL } from "./helpers";
import { getArticleStats, getAuthorStats, getCategoryStats, getOverview, rangeFromQuery } from "../../src/server/analytics/reports";

const NOW = new Date("2026-11-16T12:00:00.000Z");
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe.skipIf(!TEST_DB_URL)("analytics reports (real Postgres)", () => {
  let db: PrismaClient;
  let deps: ReturnType<typeof makeDeps>;
  beforeAll(() => { db = connect(); });
  beforeEach(async () => { await resetDatabase(db); deps = makeDeps(db, makeClock(NOW)); });
  afterAll(async () => { await db.$disconnect(); });

  const as = async (role: "READER" | "AUTHOR" | "EDITOR" | "ADMIN") => ctxFor(db, (await makeUser(db, role)).id);
  const range = (q: Parameters<typeof rangeFromQuery>[1] = {}) => rangeFromQuery(deps, q);
  const view = (articleId: string, key: string, d: string) => db.articleView.create({ data: { articleId, viewerKey: key, viewDate: day(d) } });

  it("refuses readers on every report, and authors on the site-wide ones", async () => {
    const r = range();
    for (const fn of [getOverview, getCategoryStats, getAuthorStats]) {
      await expect(fn(deps, await as("READER"), r)).rejects.toMatchObject({ status: 403 });
      await expect(fn(deps, await as("AUTHOR"), r)).rejects.toMatchObject({ status: 403 });
      await expect(fn(deps, await as("EDITOR"), r)).resolves.toBeTruthy();
    }
    await expect(getArticleStats(deps, await as("READER"), r, 10)).rejects.toMatchObject({ status: 403 });
  });

  it("turns a bad range into a 422, not a 500", () => {
    expect(() => range({ from: "nope" })).toThrowError(expect.objectContaining({ status: 422 }));
    expect(() => range({ preset: "5y" })).toThrowError(expect.objectContaining({ status: 422 }));
  });

  it("reports honest zeros on an empty site, one entry per day", async () => {
    const o = await getOverview(deps, await as("ADMIN"), range({ preset: "7d" }));
    expect(o.views.total).toBe(0);
    expect(o.views.changePercent).toBeNull();
    expect(o.views.daily).toHaveLength(7);
    expect(o.views.daily.every((d) => d.count === 0)).toBe(true);
  });

  it("counts only views inside the range, compares with the previous period and zero-fills days", async () => {
    const author = await makeUser(db, "AUTHOR");
    const a = await makeArticle(db, { authorId: author.id });
    await view(a.id, "v1", "2026-11-16"); await view(a.id, "v2", "2026-11-16");
    await view(a.id, "v1", "2026-11-12");
    await view(a.id, "v1", "2026-11-05"); // previous 7-day period (Nov 3-9)
    await view(a.id, "v1", "2026-10-01"); // outside both
    const o = await getOverview(deps, await as("EDITOR"), range({ preset: "7d" }));
    expect(o.views.total).toBe(3);
    expect(o.views.previousPeriod).toBe(1);
    expect(o.views.changePercent).toBe(200);
    expect(o.views.daily.find((d) => d.date === "2026-11-16")?.count).toBe(2);
    expect(o.views.daily.find((d) => d.date === "2026-11-13")?.count).toBe(0);
  });

  it("supports a custom range and clamps a future end date", async () => {
    const author = await makeUser(db, "AUTHOR");
    const a = await makeArticle(db, { authorId: author.id });
    await view(a.id, "v1", "2026-11-02"); await view(a.id, "v1", "2026-11-03"); await view(a.id, "v1", "2026-11-04");
    const o = await getOverview(deps, await as("ADMIN"), range({ from: "2026-11-02", to: "2026-11-03" }));
    expect(o.views.total).toBe(2);
    const future = await getOverview(deps, await as("ADMIN"), range({ from: "2026-11-10", to: "2030-01-01" }));
    expect(future.range).toMatchObject({ to: "2026-11-16", clamped: true });
  });

  it("ranks top articles by views and includes engagement from the same period", async () => {
    const author = await makeUser(db, "AUTHOR");
    const a = await makeArticle(db, { authorId: author.id, title: "Alpha" });
    const b = await makeArticle(db, { authorId: author.id, title: "Beta" });
    await view(a.id, "v1", "2026-11-15"); await view(a.id, "v2", "2026-11-15"); await view(b.id, "v1", "2026-11-15");
    await db.articleEngagement.create({ data: { articleId: a.id, viewerKey: "v1", type: "BOOKMARK", createdAt: new Date("2026-11-15T10:00:00Z") } });
    const s = await getArticleStats(deps, await as("EDITOR"), range(), 10);
    expect(s.scope).toBe("all");
    expect(s.items.map((i) => [i.title, i.views, i.engagement])).toEqual([["Alpha", 2, 1], ["Beta", 1, 0]]);
  });

  it("limits an author to their own articles, whatever they ask for", async () => {
    const mine = await makeUser(db, "AUTHOR");
    const other = await makeUser(db, "AUTHOR");
    const a = await makeArticle(db, { authorId: mine.id, title: "Mine" });
    const b = await makeArticle(db, { authorId: other.id, title: "Theirs" });
    await view(a.id, "v1", "2026-11-15"); await view(b.id, "v1", "2026-11-15"); await view(b.id, "v2", "2026-11-15");
    const s = await getArticleStats(deps, await ctxFor(db, mine.id), range(), 10);
    expect(s.scope).toBe("own");
    expect(s.items.map((i) => i.title)).toEqual(["Mine"]);
  });

  it("attributes views to categories and authors, and counts drafts separately", async () => {
    const w = await makeUser(db, "AUTHOR", { name: "Wren Writer" });
    const t = await makeArticle(db, { authorId: w.id, categorySlug: "technology" });
    const bz = await makeArticle(db, { authorId: w.id, categorySlug: "business" });
    await makeArticle(db, { authorId: w.id, status: "DRAFT", publishedAt: null });
    await view(t.id, "v1", "2026-11-15"); await view(t.id, "v2", "2026-11-15"); await view(bz.id, "v1", "2026-11-15");
    const cats = await getCategoryStats(deps, await as("ADMIN"), range());
    expect(cats.find((c) => c.name === "Technology")).toMatchObject({ published: 1, views: 2 });
    expect(cats.find((c) => c.name === "Business")).toMatchObject({ published: 1, views: 1 });
    const authors = await getAuthorStats(deps, await as("ADMIN"), range());
    expect(authors.items).toHaveLength(1);
    expect(authors.items[0]).toMatchObject({ name: "Wren Writer", published: 2, drafts: 1, views: 3, canPublishDirectly: false });
  });

  it("shows an anonymised name for a deleted account", async () => {
    const gone = await makeUser(db, "AUTHOR", { name: "Gone Person" });
    await makeArticle(db, { authorId: gone.id });
    await db.user.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });
    const { items } = await getAuthorStats(deps, await as("ADMIN"), range());
    expect(items[0]).toMatchObject({ name: "Deleted user", slug: null });
  });
});
