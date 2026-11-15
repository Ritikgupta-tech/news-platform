import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { connect, makeArticle, makeUser, resetDatabase, resetRateLimits, TEST_DB_URL } from "./helpers";
import { call } from "./http-helpers";
import { prismaContentRepository as repo } from "../../src/lib/content/prisma-repository";
import * as searchRoute from "../../src/app/api/v1/search/route";

describe.skipIf(!TEST_DB_URL)("full-text search (real Postgres)", () => {
  let db: PrismaClient;
  beforeAll(() => { db = connect(); });
  beforeEach(async () => { await resetDatabase(db); resetRateLimits(); });
  afterAll(async () => { await db.$disconnect(); });
  const opts = { page: 1, pageSize: 10 };

  async function world() {
    const author = await makeUser(db, "AUTHOR");
    const inTitle = await makeArticle(db, { authorId: author.id, title: "Satellite launch delayed" });
    const inBody = await makeArticle(db, { authorId: author.id, title: "Budget notes" });
    await db.article.update({ where: { id: inBody.id }, data: { bodyText: "The agency also mentioned a satellite in passing. ".repeat(3) } });
    const hidden = await makeArticle(db, { authorId: author.id, title: "Satellite secrets", status: "DRAFT" });
    const future = await makeArticle(db, { authorId: author.id, title: "Satellite tomorrow", publishedAt: new Date(Date.now() + 3600_000) });
    const deleted = await makeArticle(db, { authorId: author.id, title: "Satellite removed" });
    await db.article.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });
    return { inTitle, inBody, hidden, future, deleted };
  }

  it("matches stems, ranks a title hit above a body hit, and never returns unpublished, future or deleted articles", async () => {
    const w = await world();
    const r = await repo.search({ ...opts, q: "satellites" }); // plural still finds "satellite"
    expect(r.items.map((i) => i.id)).toEqual([w.inTitle.id, w.inBody.id]);
    expect(r.meta.total).toBe(2);
  });

  it("supports 'latest' ordering and pagination", async () => {
    const w = await world();
    await db.article.update({ where: { id: w.inBody.id }, data: { publishedAt: new Date(Date.now() - 1000) } });
    await db.article.update({ where: { id: w.inTitle.id }, data: { publishedAt: new Date(Date.now() - 86_400_000) } });
    const latest = await repo.search({ ...opts, q: "satellite", sort: "latest" });
    expect(latest.items.map((i) => i.id)).toEqual([w.inBody.id, w.inTitle.id]);
    const p2 = await repo.search({ q: "satellite", page: 2, pageSize: 1, sort: "latest" });
    expect(p2.items.map((i) => i.id)).toEqual([w.inTitle.id]);
    expect(p2.meta).toMatchObject({ page: 2, total: 2, totalPages: 2, hasNext: false });
  });

  it("falls back to substring matching for half-typed words and returns an empty page for no match", async () => {
    const w = await world();
    expect((await repo.search({ ...opts, q: "satell" })).items.map((i) => i.id)).toContain(w.inTitle.id);
    const none = await repo.search({ ...opts, q: "zzzzqqq" });
    expect(none.items).toEqual([]);
    expect(none.meta.total).toBe(0);
  });

  it("treats hostile input as plain text (no SQL error, no injection)", async () => {
    await world();
    for (const q of [`'; DROP TABLE "Article"; --`, `" OR 1=1 --`, `satellite & | ! ( ) :*`, "\\", "é日本語"]) {
      const r = await repo.search({ ...opts, q });
      expect(Array.isArray(r.items)).toBe(true);
    }
    expect(await db.article.count()).toBeGreaterThan(0);
  });

  it("HTTP: validates the query, caps page size, and returns the envelope", async () => {
    const w = await world();
    expect((await call(searchRoute.GET, "GET", "/api/v1/search", { origin: null })).status).toBe(422);
    expect((await call(searchRoute.GET, "GET", "/api/v1/search?q=a", { origin: null })).status).toBe(422);
    expect((await call(searchRoute.GET, "GET", "/api/v1/search?q=satellite&pageSize=999", { origin: null })).status).toBe(422);
    const res = await call(searchRoute.GET, "GET", "/api/v1/search?q=satellite&pageSize=5", { origin: null });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.map((x: { id: string }) => x.id)).toEqual([w.inTitle.id, w.inBody.id]);
    expect(body.meta.total).toBe(2);
  });
});
