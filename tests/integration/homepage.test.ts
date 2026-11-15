import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { connect, ctxFor, makeArticle, makeDeps, makeUser, resetDatabase, TEST_DB_URL } from "./helpers";
import { getHomepageConfig, promoSchema, setPromo, setSlot } from "../../src/server/homepage/service";
import { prismaContentRepository } from "../../src/lib/content/prisma-repository";

describe.skipIf(!TEST_DB_URL)("homepage controls (real Postgres)", () => {
  let db: PrismaClient;
  let deps: ReturnType<typeof makeDeps>;
  beforeAll(() => { db = connect(); });
  beforeEach(async () => { await resetDatabase(db); deps = makeDeps(db); });
  afterAll(async () => { await db.$disconnect(); });

  const as = async (role: "READER" | "AUTHOR" | "EDITOR" | "ADMIN") => ctxFor(db, (await makeUser(db, role)).id);
  const story = async (over: Partial<Omit<Parameters<typeof makeArticle>[1], "authorId">> = {}) => {
    const author = await makeUser(db, "AUTHOR");
    return makeArticle(db, { authorId: author.id, publishedAt: new Date(Date.now() - 60_000), ...over });
  };

  it("is for editors and admins only", async () => {
    const a = await story();
    for (const role of ["READER", "AUTHOR"] as const) {
      await expect(setSlot(deps, await as(role), "HERO", [a.id])).rejects.toMatchObject({ status: 403 });
      await expect(setPromo(deps, await as(role), null)).rejects.toMatchObject({ status: 403 });
      await expect(getHomepageConfig(deps, await as(role))).rejects.toMatchObject({ status: 403 });
    }
  });

  it("pins in order and the public repository serves that order", async () => {
    const [a, b, c] = [await story(), await story(), await story()];
    await setSlot(deps, await as("EDITOR"), "FEATURED", [c.id, a.id]);
    const featured = await prismaContentRepository.listFeatured(3);
    expect(featured.map((x) => x.id)).toEqual([c.id, a.id]);
    expect((await getHomepageConfig(deps, await as("EDITOR"))).candidates.map((x) => x.id)).toEqual([b.id]);
  });

  it("moves an article between slots instead of duplicating it", async () => {
    const a = await story();
    const editor = await as("EDITOR");
    await setSlot(deps, editor, "HERO", [a.id]);
    await setSlot(deps, editor, "FEATURED", [a.id]);
    const cfg = await getHomepageConfig(deps, editor);
    expect(cfg.slots.HERO).toHaveLength(0);
    expect(cfg.slots.FEATURED.map((x) => x.id)).toEqual([a.id]);
  });

  it("refuses unpublished, unknown, duplicate and too many stories", async () => {
    const editor = await as("EDITOR");
    const draft = await story({ status: "DRAFT", publishedAt: null });
    await expect(setSlot(deps, editor, "HERO", [draft.id])).rejects.toMatchObject({ status: 422 });
    await expect(setSlot(deps, editor, "HERO", ["00000000-0000-4000-8000-000000000000"])).rejects.toMatchObject({ status: 404 });
    const a = await story();
    await expect(setSlot(deps, editor, "HERO", [a.id, a.id])).rejects.toMatchObject({ status: 422 });
    const four = [await story(), await story(), await story(), await story()];
    await expect(setSlot(deps, editor, "FEATURED", four.map((x) => x.id))).rejects.toMatchObject({ status: 422 });
    expect(await db.featuredStory.count()).toBe(0);
  });

  it("clears a slot with an empty list and audits changes", async () => {
    const a = await story();
    const editor = await as("EDITOR");
    await setSlot(deps, editor, "HERO", [a.id]);
    await setSlot(deps, editor, "HERO", []);
    expect(await db.featuredStory.count()).toBe(0);
    expect(await db.auditLog.count({ where: { action: "homepage.slot.set" } })).toBe(2);
  });

  it("hides a pinned story from the public once it is archived", async () => {
    const a = await story();
    await setSlot(deps, await as("EDITOR"), "FEATURED", [a.id]);
    await db.article.update({ where: { id: a.id }, data: { status: "ARCHIVED" } });
    expect(await prismaContentRepository.listFeatured(3)).toEqual([]);
    expect((await getHomepageConfig(deps, await as("EDITOR"))).slots.FEATURED[0]?.live).toBe(false);
  });

  it("saves, serves and clears the promo banner; rejects unsafe links", async () => {
    const editor = await as("EDITOR");
    const input = { title: "Get the weekly briefing", ctaLabel: "Subscribe", ctaHref: "/newsletter" };
    await setPromo(deps, editor, input);
    expect(await prismaContentRepository.getPromo()).toMatchObject(input);
    await setPromo(deps, editor, null);
    expect(await prismaContentRepository.getPromo()).toBeNull();
    for (const bad of ["javascript:alert(1)", "//evil.example", "http://plain.example", "data:text/html,x"]) {
      expect(promoSchema.safeParse({ ...input, ctaHref: bad }).success).toBe(false);
    }
    expect(promoSchema.safeParse({ ...input, ctaHref: "https://example.org/x" }).success).toBe(true);
  });
});
