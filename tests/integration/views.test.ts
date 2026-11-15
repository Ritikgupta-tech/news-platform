import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { connect, makeArticle, makeClock, makeDeps, makeUser, resetDatabase, resetRateLimits, TEST_DB_URL } from "./helpers";
import { call, Jar, signInAs } from "./http-helpers";
import { recordView, viewerKeyFor } from "../../src/server/analytics/views";
import * as viewsRoute from "../../src/app/api/v1/analytics/views/route";

const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

describe.skipIf(!TEST_DB_URL)("view collection (real Postgres)", () => {
  let db: PrismaClient;
  beforeAll(() => { db = connect(); });
  beforeEach(async () => { await resetDatabase(db); resetRateLimits(); });
  afterAll(async () => { await db.$disconnect(); });
  const base = { userId: null, userAgent: BROWSER, ip: "unknown", optedOut: false } as const;

  it("counts one view per viewer per UTC day; refreshes and repeats do not inflate it", async () => {
    const author = await makeUser(db, "AUTHOR");
    const art = await makeArticle(db, { authorId: author.id });
    const clock = makeClock(); // real "now": the article must already be published
    const deps = makeDeps(db, clock);
    const first = await recordView(deps, { ...base, articleId: art.id, anonId: undefined });
    expect(first.counted).toBe(true);
    expect(first.newAnonId).toBeTruthy();
    const id = first.newAnonId!;
    for (let i = 0; i < 5; i++) expect((await recordView(deps, { ...base, articleId: art.id, anonId: id })).reason).toBe("duplicate");
    expect(await db.articleView.count()).toBe(1);
    clock.advance(24 * 3600_000); // next UTC day
    expect((await recordView(deps, { ...base, articleId: art.id, anonId: id })).counted).toBe(true);
    const other = await recordView(deps, { ...base, articleId: art.id, anonId: undefined }); // a different browser
    expect(other.counted).toBe(true);
    expect(await db.articleView.count()).toBe(3);
  });

  it("does not count bots, opted-out browsers or articles that are not live, and stores no raw identifiers", async () => {
    const author = await makeUser(db, "AUTHOR");
    const live = await makeArticle(db, { authorId: author.id });
    const draft = await makeArticle(db, { authorId: author.id, status: "DRAFT" });
    const deps = makeDeps(db);
    expect((await recordView(deps, { ...base, articleId: live.id, anonId: undefined, userAgent: "Googlebot/2.1" })).reason).toBe("bot");
    expect((await recordView(deps, { ...base, articleId: live.id, anonId: undefined, userAgent: null })).reason).toBe("bot");
    expect((await recordView(deps, { ...base, articleId: live.id, anonId: undefined, optedOut: true })).reason).toBe("opted_out");
    expect((await recordView(deps, { ...base, articleId: draft.id, anonId: undefined })).reason).toBe("not_live");
    expect(await db.articleView.count()).toBe(0);
    const r = await recordView(deps, { ...base, articleId: live.id, anonId: undefined });
    const row = await db.articleView.findFirstOrThrow();
    expect(row.viewerKey).toBe(viewerKeyFor(deps, { anonId: r.newAnonId! }));
    expect(row.viewerKey).not.toContain(r.newAnonId!);
  });

  it("a signed-in reader counts once across devices (keyed by user, not cookie)", async () => {
    const author = await makeUser(db, "AUTHOR");
    const reader = await makeUser(db, "READER");
    const art = await makeArticle(db, { authorId: author.id });
    const deps = makeDeps(db);
    expect((await recordView(deps, { ...base, userId: reader.id, articleId: art.id, anonId: undefined })).counted).toBe(true);
    expect((await recordView(deps, { ...base, userId: reader.id, articleId: art.id, anonId: "A".repeat(24) })).counted).toBe(false);
    expect(await db.articleView.count()).toBe(1);
  });

  it("feeds Most Viewed and Trending with the recorded numbers", async () => {
    const { prismaContentRepository: repo } = await import("../../src/lib/content/prisma-repository");
    const author = await makeUser(db, "AUTHOR");
    const a = await makeArticle(db, { authorId: author.id, title: "Popular" });
    const b = await makeArticle(db, { authorId: author.id, title: "Quiet" });
    const deps = makeDeps(db);
    for (let i = 0; i < 3; i++) await recordView(deps, { ...base, articleId: a.id, anonId: undefined });
    await recordView(deps, { ...base, articleId: b.id, anonId: undefined });
    const most = await repo.listMostViewed(5);
    expect(most.map((x) => [x.title, x.views])).toEqual([["Popular", 3], ["Quiet", 1]]);
  });

  it("HTTP: sets a scoped HttpOnly cookie once, counts once on repeat, honours Global Privacy Control, rejects cross-site and bad input", async () => {
    const author = await makeUser(db, "AUTHOR");
    const art = await makeArticle(db, { authorId: author.id });
    const jar = new Jar();
    const headers = { "user-agent": BROWSER };
    const path = "/api/v1/analytics/views";
    const r1 = await call(viewsRoute.POST, "POST", path, { body: { articleId: art.id }, cookie: jar, headers });
    expect(r1.status).toBe(200);
    expect((await r1.json()).data).toEqual({ counted: true });
    const set = r1.headers.getSetCookie().join("\n");
    expect(set).toMatch(/enews_vid=/);
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/Path=\/api\/v1\/analytics/);
    jar.update(r1);
    const r2 = await call(viewsRoute.POST, "POST", path, { body: { articleId: art.id }, cookie: jar, headers });
    expect((await r2.json()).data).toEqual({ counted: false });
    expect(r2.headers.getSetCookie()).toHaveLength(0);
    const gpc = await call(viewsRoute.POST, "POST", path, { body: { articleId: art.id }, headers: { ...headers, "sec-gpc": "1" } });
    expect((await gpc.json()).data).toEqual({ counted: false });
    expect(gpc.headers.getSetCookie()).toHaveLength(0);
    expect((await call(viewsRoute.POST, "POST", path, { origin: "https://evil.example", body: { articleId: art.id }, headers })).status).toBe(403);
    expect((await call(viewsRoute.POST, "POST", path, { body: { articleId: "nope" }, headers })).status).toBe(422);
    expect(await db.articleView.count()).toBe(1);
    const reader = await signInAs(db, "READER", "v@example.test");
    const signed = await call(viewsRoute.POST, "POST", path, { body: { articleId: art.id }, cookie: reader.cookie, headers });
    expect((await signed.json()).data).toEqual({ counted: true });
    expect(signed.headers.getSetCookie().join("")).not.toMatch(/enews_vid/); // no anonymous id for signed-in readers
  });
});
