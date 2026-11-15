import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { connect, ctxFor, makeArticle, makeDeps, makeUser, resetDatabase, resetRateLimits, TEST_DB_URL } from "./helpers";
import { call, params, signInAs } from "./http-helpers";
import { createComment, deleteComment, listComments, listForModeration, moderateComment, reportComment } from "../../src/server/comments/service";
import * as articleComments from "../../src/app/api/v1/articles/[idOrSlug]/comments/route";
import * as commentRoute from "../../src/app/api/v1/comments/[id]/route";
import * as reportRoute from "../../src/app/api/v1/comments/[id]/report/route";
import * as adminRoute from "../../src/app/api/v1/admin/comments/route";

describe.skipIf(!TEST_DB_URL)("comments and moderation (real Postgres)", () => {
  let db: PrismaClient;
  beforeAll(() => { db = connect(); });
  beforeEach(async () => { await resetDatabase(db); resetRateLimits(); });
  afterAll(async () => { await db.$disconnect(); });
  const q = { page: 1, pageSize: 50 };

  async function world() {
    const author = await makeUser(db, "AUTHOR");
    const art = await makeArticle(db, { authorId: author.id });
    const alice = await makeUser(db, "READER", { name: "Alice" });
    const bob = await makeUser(db, "READER", { name: "Bob" });
    const editor = await makeUser(db, "EDITOR");
    const deps = makeDeps(db);
    return { art, alice, bob, editor, deps, ca: await ctxFor(db, alice.id), cb: await ctxFor(db, bob.id), ce: await ctxFor(db, editor.id) };
  }

  it("posts, lists oldest first, stores text untouched, records one COMMENT engagement per person", async () => {
    const w = await world();
    const evil = `<script>alert(1)</script> hi`;
    const c1 = await createComment(w.deps, w.ca, w.art.id, { body: evil });
    await createComment(w.deps, w.ca, w.art.slug, { body: "second" });
    expect(c1.body).toBe(evil); // stored as text; React escapes on render
    const list = await listComments(w.deps, w.art.slug, w.alice.id, q);
    expect(list.items.map((i) => i.body)).toEqual([evil, "second"]);
    expect(list.items.every((i) => i.mine)).toBe(true);
    expect((await listComments(w.deps, w.art.id, null, q)).items.some((i) => i.mine)).toBe(false);
    expect(await db.articleEngagement.count({ where: { articleId: w.art.id, type: "COMMENT" } })).toBe(1);
  });

  it("refuses comments on unpublished articles, and rate limits spammers", async () => {
    const w = await world();
    const draft = await makeArticle(db, { authorId: w.art.authorId, status: "DRAFT" });
    await expect(createComment(w.deps, w.ca, draft.id, { body: "hello" })).rejects.toMatchObject({ status: 404 });
    await expect(listComments(w.deps, draft.id, null, q)).rejects.toMatchObject({ status: 404 });
    for (let i = 0; i < 10; i++) await createComment(w.deps, w.ca, w.art.id, { body: `c${i} ok` });
    await expect(createComment(w.deps, w.ca, w.art.id, { body: "one too many" })).rejects.toMatchObject({ status: 429 });
  });

  it("delete: owner or moderator only; others get 404; deleted comments disappear", async () => {
    const w = await world();
    const c = await createComment(w.deps, w.ca, w.art.id, { body: "mine" });
    await expect(deleteComment(w.deps, w.cb, c.id)).rejects.toMatchObject({ status: 404 });
    expect((await listComments(w.deps, w.art.id, null, q)).meta.total).toBe(1);
    await deleteComment(w.deps, w.ca, c.id);
    expect((await listComments(w.deps, w.art.id, null, q)).meta.total).toBe(0);
    const c2 = await createComment(w.deps, w.cb, w.art.id, { body: "bobs" });
    await deleteComment(w.deps, w.ce, c2.id);
    expect(await db.auditLog.count({ where: { action: { in: ["comment.delete", "comment.delete_own"] } } })).toBe(2);
  });

  it("report -> moderator hides -> public no longer sees it -> restore brings it back; readers cannot moderate", async () => {
    const w = await world();
    const c = await createComment(w.deps, w.ca, w.art.id, { body: "borderline" });
    await expect(reportComment(w.deps, w.ca, c.id)).rejects.toMatchObject({ status: 409 }); // own comment
    await reportComment(w.deps, w.cb, c.id);
    await reportComment(w.deps, w.cb, c.id); // idempotent
    expect((await db.comment.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("REPORTED");
    expect((await listComments(w.deps, w.art.id, null, q)).items[0]!.reported).toBe(true); // still visible until actioned
    expect((await listForModeration(w.deps, w.ce, { page: 1, pageSize: 20 })).items.map((i) => i.id)).toEqual([c.id]);
    await expect(moderateComment(w.deps, w.cb, c.id, { status: "HIDDEN" })).rejects.toMatchObject({ status: 403 });
    await expect(listForModeration(w.deps, w.cb, { page: 1, pageSize: 20 })).rejects.toMatchObject({ status: 403 });
    await moderateComment(w.deps, w.ce, c.id, { status: "HIDDEN" });
    expect((await listComments(w.deps, w.art.id, null, q)).meta.total).toBe(0);
    await expect(reportComment(w.deps, w.cb, c.id)).rejects.toMatchObject({ status: 404 }); // hidden: nothing to report
    await moderateComment(w.deps, w.ce, c.id, { status: "VISIBLE" });
    expect((await listComments(w.deps, w.art.id, null, q)).meta.total).toBe(1);
    expect(await db.auditLog.count({ where: { entityId: c.id } })).toBeGreaterThanOrEqual(4);
  });

  it("HTTP: anonymous may read but not write; validation; cross-site blocked; moderation endpoints are role-gated", async () => {
    const w = await world();
    const base = `/api/v1/articles/${w.art.slug}/comments`;
    const ctx = params({ idOrSlug: w.art.slug });
    expect((await call(articleComments.GET, "GET", base, { origin: null }, ctx)).status).toBe(200);
    expect((await call(articleComments.POST, "POST", base, { body: { body: "hello there" } }, ctx)).status).toBe(401);
    const alice = await signInAs(db, "READER", "alice2@example.test");
    expect((await call(articleComments.POST, "POST", base, { cookie: alice.cookie, body: { body: "x" } }, ctx)).status).toBe(422);
    expect((await call(articleComments.POST, "POST", base, { cookie: alice.cookie, body: { body: "y".repeat(1501) } }, ctx)).status).toBe(422);
    expect((await call(articleComments.POST, "POST", base, { cookie: alice.cookie, origin: "https://evil.example", body: { body: "hello there" } }, ctx)).status).toBe(403);
    const made = await call(articleComments.POST, "POST", base, { cookie: alice.cookie, body: { body: "hello there" } }, ctx);
    expect(made.status).toBe(201);
    const id = (await made.json()).data.id as string;
    expect((await call(commentRoute.PATCH, "PATCH", `/api/v1/comments/${id}`, { cookie: alice.cookie, body: { status: "HIDDEN" } }, params({ id }))).status).toBe(403);
    expect((await call(adminRoute.GET, "GET", "/api/v1/admin/comments", { origin: null, cookie: alice.cookie })).status).toBe(403);
    expect((await call(adminRoute.GET, "GET", "/api/v1/admin/comments", { origin: null })).status).toBe(401);
    const editor = await signInAs(db, "EDITOR", "ed2@example.test");
    expect((await call(reportRoute.POST, "POST", `/api/v1/comments/${id}/report`, { cookie: editor.cookie }, params({ id }))).status).toBe(200);
    expect((await call(adminRoute.GET, "GET", "/api/v1/admin/comments", { origin: null, cookie: editor.cookie })).status).toBe(200);
    expect((await call(commentRoute.PATCH, "PATCH", `/api/v1/comments/${id}`, { cookie: editor.cookie, body: { status: "DELETED" } }, params({ id }))).status).toBe(422);
  });
});
