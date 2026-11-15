import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { connect, ctxFor, makeArticle, makeDeps, makeUser, resetDatabase, TEST_DB_URL } from "./helpers";
import { createCategory, deleteCategory, getCategory, listCategories, updateCategory } from "../../src/server/categories/service";
import { createTag, deleteTag, listTags, updateTag } from "../../src/server/tags/service";
import { listAuditLogs, listUsers, setAuthorPublishGrant, setUserRoles } from "../../src/server/users/service";
import { authenticateToken } from "../../src/server/auth/guard";
import { signAccessToken } from "../../src/server/auth/jwt";
import { canTransition } from "../../src/lib/workflow";

describe.skipIf(!TEST_DB_URL)("categories, tags, users, audit (real Postgres)", () => {
  let db: PrismaClient;
  let deps: ReturnType<typeof makeDeps>;
  beforeAll(() => { db = connect(); });
  beforeEach(async () => { await resetDatabase(db); deps = makeDeps(db); });
  afterAll(async () => { await db.$disconnect(); });

  const as = async (role: "READER" | "AUTHOR" | "EDITOR" | "ADMIN") => ctxFor(db, (await makeUser(db, role)).id);

  describe("categories", () => {
    it("is managed by editors/admins only, with audit entries", async () => {
      for (const role of ["READER", "AUTHOR"] as const) {
        await expect(createCategory(deps, await as(role), { name: "Nope", sortOrder: 0, isActive: true })).rejects.toMatchObject({ status: 403 });
      }
      const editor = await as("EDITOR");
      const c = await createCategory(deps, editor, { name: "Culture & Arts", sortOrder: 5, isActive: true });
      expect(c.slug).toBe("culture-and-arts");
      const u = await updateCategory(deps, editor, c.id, { name: "Culture", sortOrder: 6 });
      expect(u).toMatchObject({ name: "Culture", sortOrder: 6, slug: "culture-and-arts" });
      expect(await db.auditLog.count({ where: { entityType: "Category" } })).toBe(2);
    });
    it("rejects duplicate slugs and bad updates", async () => {
      const editor = await as("EDITOR");
      await expect(createCategory(deps, editor, { name: "Technology Again", slug: "technology", sortOrder: 0, isActive: true })).rejects.toMatchObject({ status: 409 });
      await expect(updateCategory(deps, editor, "00000000-0000-4000-8000-000000000000", { name: "x y" })).rejects.toMatchObject({ status: 404 });
      const biz = await getCategory(deps, null, "business");
      await expect(updateCategory(deps, editor, biz.id, { slug: "technology" })).rejects.toMatchObject({ status: 409 });
    });
    it("hides inactive categories from the public but not from managers", async () => {
      const editor = await as("EDITOR");
      const sci = await getCategory(deps, null, "science");
      await updateCategory(deps, editor, sci.id, { isActive: false });
      expect((await listCategories(deps, null, false)).map((c) => c.slug)).not.toContain("science");
      expect((await listCategories(deps, null, true)).map((c) => c.slug)).not.toContain("science"); // anonymous cannot opt in
      expect((await listCategories(deps, editor, true)).map((c) => c.slug)).toContain("science");
      await expect(getCategory(deps, null, "science")).rejects.toMatchObject({ status: 404 });
      expect((await getCategory(deps, editor, "science")).isActive).toBe(false);
    });
    it("refuses to delete a category that has articles, allows deleting an empty one", async () => {
      const editor = await as("EDITOR");
      const author = await makeUser(db, "AUTHOR");
      await makeArticle(db, { authorId: author.id, categorySlug: "health" });
      const health = await getCategory(deps, null, "health");
      await expect(deleteCategory(deps, editor, health.id)).rejects.toMatchObject({ status: 409 });
      const empty = await createCategory(deps, editor, { name: "Temporary", sortOrder: 0, isActive: true });
      await deleteCategory(deps, editor, empty.id);
      await expect(getCategory(deps, editor, empty.id)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("tags", () => {
    it("supports CRUD for editors, search, and cascades article links on delete", async () => {
      await expect(createTag(deps, await as("AUTHOR"), { name: "Nope" })).rejects.toMatchObject({ status: 403 });
      const editor = await as("EDITOR");
      const t = await createTag(deps, editor, { name: "Climate Change" });
      expect(t.slug).toBe("climate-change");
      await expect(createTag(deps, editor, { name: "Climate Change" })).rejects.toMatchObject({ status: 409 });
      const author = await makeUser(db, "AUTHOR");
      const art = await makeArticle(db, { authorId: author.id });
      await db.articleTag.create({ data: { articleId: art.id, tagId: t.id } });
      const found = await listTags(deps, { page: 1, pageSize: 10, q: "climate" });
      expect(found.items).toEqual([expect.objectContaining({ slug: "climate-change", articleCount: 1 })]);
      expect((await updateTag(deps, editor, t.id, { name: "Climate" })).name).toBe("Climate");
      await deleteTag(deps, editor, t.id);
      expect(await db.articleTag.count({ where: { articleId: art.id } })).toBe(0);
      expect(await db.article.count({ where: { id: art.id } })).toBe(1); // article untouched
      await expect(deleteTag(deps, editor, t.id)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("user and role administration", () => {
    it("is admin-only", async () => {
      for (const role of ["READER", "AUTHOR", "EDITOR"] as const) {
        const ctx = await as(role);
        await expect(listUsers(deps, ctx, { page: 1, pageSize: 10 })).rejects.toMatchObject({ status: 403 });
        await expect(setUserRoles(deps, ctx, ctx.id, ["ADMIN"])).rejects.toMatchObject({ status: 403 }); // no self-promotion
        await expect(listAuditLogs(deps, ctx, { page: 1, pageSize: 10 })).rejects.toMatchObject({ status: 403 });
      }
    });
    it("lists and filters users without leaking password hashes", async () => {
      const admin = await as("ADMIN");
      await makeUser(db, "EDITOR", { name: "Findable Editor" });
      const res = await listUsers(deps, admin, { page: 1, pageSize: 10, q: "findable" });
      expect(res.items).toHaveLength(1);
      expect(JSON.stringify(res)).not.toMatch(/passwordHash|not-a-real-hash/);
      expect((await listUsers(deps, admin, { page: 1, pageSize: 10, role: "ADMIN" })).items).toHaveLength(1);
    });
    it("changes roles (READER always kept), applies instantly, and audits before/after", async () => {
      const admin = await as("ADMIN");
      const target = await makeUser(db, "READER");
      const secret = process.env.JWT_ACCESS_SECRET!;
      const s = await db.session.create({ data: { userId: target.id, refreshTokenHash: "h1", expiresAt: new Date(Date.now() + 1e7) } });
      const token = await signAccessToken({ userId: target.id, sessionId: s.id }, secret);
      expect((await authenticateToken(deps, token))?.roles).toEqual(["READER"]);
      const dto = await setUserRoles(deps, admin, target.id, ["EDITOR"]);
      expect(dto.roles.sort()).toEqual(["EDITOR", "READER"]);
      expect((await authenticateToken(deps, token))?.roles.sort()).toEqual(["EDITOR", "READER"]);
      const log = await db.auditLog.findFirstOrThrow({ where: { action: "user.roles.change" } });
      expect(log.metadata).toMatchObject({ before: ["READER"], after: ["READER", "EDITOR"] });
      expect(log.actorId).toBe(admin.id);
      await expect(setUserRoles(deps, admin, "00000000-0000-4000-8000-000000000000", ["EDITOR"])).rejects.toMatchObject({ status: 404 });
    });
    it("never leaves the platform without an administrator", async () => {
      const a1 = await as("ADMIN");
      await expect(setUserRoles(deps, a1, a1.id, ["EDITOR"])).rejects.toMatchObject({ status: 409 }); // self-demotion blocked
      const a2 = await as("ADMIN");
      // two admins demote each other at the same time: exactly one succeeds
      const results = await Promise.allSettled([setUserRoles(deps, a1, a2.id, ["READER"]), setUserRoles(deps, a2, a1.id, ["READER"])]);
      expect(results.filter((r) => r.status === "fulfilled").length).toBeLessThanOrEqual(1);
      const admins = await db.userRole.count({ where: { role: { name: "ADMIN" } } });
      expect(admins).toBeGreaterThanOrEqual(1);
    });
    it("grants and revokes direct-publish rights, which the workflow then honours", async () => {
      const admin = await as("ADMIN");
      const authorUser = await makeUser(db, "AUTHOR");
      await expect(setAuthorPublishGrant(deps, admin, (await makeUser(db, "READER")).id, true)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      let ctx = await ctxFor(db, authorUser.id);
      expect(canTransition("DRAFT", "PUBLISHED", ctx)).toBe(false);
      await setAuthorPublishGrant(deps, admin, authorUser.id, true);
      ctx = await ctxFor(db, authorUser.id);
      expect(ctx.canPublishDirectly).toBe(true);
      expect(canTransition("DRAFT", "PUBLISHED", ctx)).toBe(true);
      await setAuthorPublishGrant(deps, admin, authorUser.id, false);
      expect(canTransition("DRAFT", "PUBLISHED", await ctxFor(db, authorUser.id))).toBe(false);
      // admins who never had an author profile get one created on demand
      const adminOnly = await makeUser(db, "ADMIN");
      await db.authorProfile.deleteMany({ where: { userId: adminOnly.id } });
      await setAuthorPublishGrant(deps, admin, adminOnly.id, true);
      expect(await db.authorProfile.count({ where: { userId: adminOnly.id } })).toBe(1);
    });
  });

  describe("audit log", () => {
    it("lists newest first with filters and exposes no sensitive fields", async () => {
      const admin = await as("ADMIN");
      const editor = await as("EDITOR");
      await createCategory(deps, editor, { name: "Audited Category", sortOrder: 0, isActive: true });
      await createTag(deps, editor, { name: "Audited Tag" });
      const all = await listAuditLogs(deps, admin, { page: 1, pageSize: 20 });
      expect(all.items.map((i) => i.action)).toEqual(["tag.create", "category.create"]);
      expect((await listAuditLogs(deps, admin, { page: 1, pageSize: 20, action: "category" })).items).toHaveLength(1);
      expect((await listAuditLogs(deps, admin, { page: 1, pageSize: 20, actorId: editor.id })).meta.total).toBe(2);
      expect(JSON.stringify(all)).not.toMatch(/email|password/i);
    });
  });
});
