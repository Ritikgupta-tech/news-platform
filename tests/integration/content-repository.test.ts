import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { connect, makeArticle, makeUser, resetDatabase, TEST_DB_URL } from "./helpers";
import { prismaContentRepository as repo } from "../../src/lib/content/prisma-repository";

describe.skipIf(!TEST_DB_URL)("Stage 4 prisma content repository (real Postgres)", () => {
  let db: PrismaClient;
  let slugs: string[] = [];
  let draftSlug = "";
  let futureSlug = "";

  beforeAll(async () => {
    db = connect();
    await resetDatabase(db);
    const author = await makeUser(db, "AUTHOR", { name: "Repo Author" });
    const cats = ["technology", "business", "health", "sports", "world"];
    for (const [i, c] of cats.entries()) {
      const a = await makeArticle(db, { authorId: author.id, categorySlug: c, title: `Repo story ${i}`, publishedAt: new Date(Date.now() - (i + 1) * 3_600_000), isBreaking: i === 0 });
      slugs.push(a.slug);
    }
    draftSlug = (await makeArticle(db, { authorId: author.id, title: "Hidden draft", status: "DRAFT" })).slug;
    futureSlug = (await makeArticle(db, { authorId: author.id, title: "Future story", status: "PUBLISHED", publishedAt: new Date(Date.now() + 86_400_000) })).slug;
    // real analytics rows: article 2 gets the most unique views
    const rows = await db.article.findMany({ where: { slug: { in: slugs } } });
    const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r.id]));
    const today = new Date(new Date().toISOString().slice(0, 10));
    for (let v = 0; v < 5; v++) await db.articleView.create({ data: { articleId: bySlug[slugs[2]!]!, viewerKey: `v${v}`, viewDate: today } });
    await db.articleView.create({ data: { articleId: bySlug[slugs[0]!]!, viewerKey: "solo", viewDate: today } });
  });
  afterAll(async () => { await db.$disconnect(); });

  it("lists latest published only, newest first, excluding drafts and future-dated", async () => {
    const res = await repo.listLatest({ page: 1, pageSize: 20 });
    const got = res.items.map((i) => i.slug);
    expect(got).toEqual(slugs);
    expect(got).not.toContain(draftSlug);
    expect(got).not.toContain(futureSlug);
    expect(res.meta.total).toBe(5);
  });

  it("paginates and filters by category", async () => {
    const p2 = await repo.listLatest({ page: 2, pageSize: 2 });
    expect(p2.items).toHaveLength(2);
    expect(p2.meta).toMatchObject({ page: 2, totalPages: 3, hasNext: true });
    const tech = await repo.listLatest({ page: 1, pageSize: 10, categorySlug: "technology" });
    expect(tech.items.map((i) => i.category.slug)).toEqual(["technology"]);
  });

  it("returns hero (pinned first, then newest with image), featured and ranked lists", async () => {
    // Nothing pinned and no images yet: hero is legitimately empty (no fake fallback).
    expect(await repo.listHero(3)).toEqual([]);
    const rows = await db.article.findMany({ where: { slug: { in: slugs } } });
    const id = (slug: string) => rows.find((r) => r.slug === slug)!.id;
    const uploader = (await db.user.findFirstOrThrow()).id;
    const media = await db.mediaAsset.create({
      data: { storageKey: "test/hero.jpg", url: "https://cdn.example.test/hero.jpg", mimeType: "image/jpeg", sizeBytes: 1000, altText: "Test image", uploadedBy: uploader },
    });
    await db.article.update({ where: { id: id(slugs[1]!) }, data: { heroImageId: media.id } });
    expect((await repo.listHero(3)).map((h) => h.slug)).toEqual([slugs[1]]);
    await db.featuredStory.create({ data: { articleId: id(slugs[0]!), slot: "HERO", position: 0 } });
    await db.featuredStory.create({ data: { articleId: id(slugs[2]!), slot: "FEATURED", position: 0 } });
    expect((await repo.listHero(3)).map((h) => h.slug)).toEqual([slugs[0], slugs[1]]);
    expect((await repo.listFeatured(3)).map((f) => f.slug)).toEqual([slugs[2]]);
    const most = await repo.listMostViewed(3);
    expect(most[0]?.slug).toBe(slugs[2]);
    expect(most[0]?.views).toBe(5);
    const trending = await repo.listTrending(5);
    expect(trending.length).toBeGreaterThan(0);
  });

  it("gets an article with tags/author, hides drafts and future articles", async () => {
    const a = await repo.getArticle(slugs[0]!);
    expect(a?.title).toBe("Repo story 0");
    expect(a?.author.name).toBe("Repo Author");
    expect(await repo.getArticle(draftSlug)).toBeNull();
    expect(await repo.getArticle(futureSlug)).toBeNull();
    expect(await repo.getArticle("does-not-exist")).toBeNull();
  });

  it("finds related and adjacent articles without including drafts", async () => {
    const rel = await repo.listRelated(slugs[0]!, 4);
    expect(rel.map((r) => r.slug)).not.toContain(slugs[0]);
    expect(rel.map((r) => r.slug)).not.toContain(draftSlug);
    const adj = await repo.getAdjacent(slugs[2]!);
    expect(adj.previous?.slug ?? adj.next?.slug).toBeTruthy();
  });

  it("lists categories and one category", async () => {
    const cats = await repo.listCategories();
    expect(cats.map((c) => c.slug)).toContain("technology");
    expect(await repo.getCategory("technology")).toMatchObject({ name: "Technology" });
    expect(await repo.getCategory("nope")).toBeNull();
  });

  it("searches title and body, case-insensitively, published only", async () => {
    const hit = await repo.search({ q: "repo STORY 3", page: 1, pageSize: 10 });
    expect(hit.items.map((i) => i.slug)).toContain(slugs[3]);
    const hidden = await repo.search({ q: "Hidden draft", page: 1, pageSize: 10 });
    expect(hidden.items).toHaveLength(0);
    const none = await repo.search({ q: "zzzzqqqq", page: 1, pageSize: 10 });
    expect(none.meta.total).toBe(0);
  });

  it("returns author, promo and sitemap entries", async () => {
    const authors = await db.authorProfile.findMany();
    const author = await repo.getAuthor(authors[0]!.slug);
    expect(author?.name).toBe("Repo Author");
    expect(await repo.getAuthor("ghost")).toBeNull();
    expect(await repo.getPromo()).toBeNull();
    const sm = await repo.listSitemapEntries(100);
    expect(sm.map((s) => s.slug).sort()).toEqual([...slugs].sort());
  });
});
