import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { connect, ctxFor, makeArticle, makeDeps, makeUser, resetDatabase, TEST_DB_URL } from "./helpers";
import { deleteMedia, uploadMedia, MAX_UPLOAD_BYTES } from "../../src/server/media/service";
import { LocalDiskStorage } from "../../src/server/media/storage";
import { createArticle } from "../../src/server/articles/service";
import { setRateLimiter } from "../../src/server/security/rate-limit";
import { gif, jpeg, png, svg } from "../media-fixtures";

describe.skipIf(!TEST_DB_URL)("media uploads (real Postgres, temp-dir storage)", () => {
  let db: PrismaClient;
  let deps: ReturnType<typeof makeDeps>;
  let dir: string;
  let storage: LocalDiskStorage;
  beforeAll(() => { db = connect(); });
  beforeEach(async () => { await resetDatabase(db); setRateLimiter(undefined); deps = makeDeps(db); dir = await mkdtemp(path.join(os.tmpdir(), "enews-int-")); storage = new LocalDiskStorage(dir); });
  afterAll(async () => { await db.$disconnect(); });
  const cleanup = () => rm(dir, { recursive: true, force: true });
  const as = async (role: "READER" | "AUTHOR" | "EDITOR" | "ADMIN") => ctxFor(db, (await makeUser(db, role)).id);
  const meta = { altText: "A newsroom at night" };

  it("stores a verified image and records its real type and size", async () => {
    const author = await as("AUTHOR");
    const m = await uploadMedia(deps, author, jpeg(1200, 800), { ...meta, credit: "A. Photographer" }, storage);
    expect(m).toMatchObject({ mimeType: "image/jpeg", width: 1200, height: 800, credit: "A. Photographer" });
    expect(m.url).toMatch(/^\/media\/[0-9a-f-]{36}\.jpg$/);
    expect(await storage.get(m.url.replace("/media/", ""))).not.toBeNull();
    expect(await db.auditLog.count({ where: { action: "media.upload" } })).toBe(1);
    await cleanup();
  });

  it("is for people who can write articles", async () => {
    await expect(uploadMedia(deps, await as("READER"), png(10, 10), meta, storage)).rejects.toMatchObject({ status: 403 });
    await cleanup();
  });

  it("refuses non-images however they are named, empty files and oversize files", async () => {
    const author = await as("AUTHOR");
    for (const bad of [svg(), gif(), new TextEncoder().encode("MZ not an image")]) await expect(uploadMedia(deps, author, bad, meta, storage)).rejects.toMatchObject({ status: 422 });
    await expect(uploadMedia(deps, author, new Uint8Array(0), meta, storage)).rejects.toMatchObject({ status: 422 });
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1); big.set(png(10, 10));
    await expect(uploadMedia(deps, author, big, meta, storage)).rejects.toMatchObject({ status: 413 });
    expect(await db.mediaAsset.count()).toBe(0);
    await cleanup();
  });

  it("rate limits uploads per person", async () => {
    const author = await as("AUTHOR");
    for (let i = 0; i < 30; i++) await uploadMedia(deps, author, png(10 + i, 10), meta, storage);
    await expect(uploadMedia(deps, author, png(99, 10), meta, storage)).rejects.toMatchObject({ status: 429 });
    await cleanup();
  });

  it("lets an article use the image, and blocks deleting an image that is in use", async () => {
    const author = await as("AUTHOR");
    const m = await uploadMedia(deps, author, png(800, 450), meta, storage);
    const cat = await db.category.findUniqueOrThrow({ where: { slug: "technology" } });
    const art = await createArticle(deps, author, { title: "A story with a picture", summary: "A summary long enough.", bodyHtml: "<p>Body text for the story.</p>", categoryId: cat.id, tags: [], heroImageId: m.id });
    await expect(deleteMedia(deps, author, m.id, storage)).rejects.toMatchObject({ status: 409 });
    await db.article.update({ where: { id: art.id }, data: { heroImageId: null } });
    await deleteMedia(deps, author, m.id, storage);
    expect(await storage.get(m.url.replace("/media/", ""))).toBeNull();
    expect((await db.mediaAsset.findUniqueOrThrow({ where: { id: m.id } })).deletedAt).not.toBeNull();
    await cleanup();
  });

  it("hides other people's uploads from delete, but editors can remove them", async () => {
    const m = await uploadMedia(deps, await as("AUTHOR"), png(10, 10), meta, storage);
    await expect(deleteMedia(deps, await as("AUTHOR"), m.id, storage)).rejects.toMatchObject({ status: 404 });
    await deleteMedia(deps, await as("EDITOR"), m.id, storage);
    await expect(deleteMedia(deps, await as("EDITOR"), m.id, storage)).rejects.toMatchObject({ status: 404 });
    await cleanup();
  });
  void makeArticle;
});
