import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ZodError } from "zod";
import { connect, ctxFor, makeClock, makeDeps, makeUser, resetDatabase, TEST_DB_URL } from "./helpers";
import { createArticle, getPublishedBySlug, listArticles, updateArticle } from "../../src/server/articles/service";
import { listArticlesQuery } from "../../src/server/articles/validation";
import { applyAction, listReviews, listRevisions } from "../../src/server/editorial/service";
import { publishDueArticles } from "../../src/server/editorial/scheduler";
import { listNotifications, markNotificationsRead } from "../../src/server/notifications/service";
import { setAuthorPublishGrant } from "../../src/server/users/service";

describe.skipIf(!TEST_DB_URL)("editorial workflow (real Postgres)", () => {
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

  const as = async (role: "READER" | "AUTHOR" | "EDITOR" | "ADMIN", name?: string) => ctxFor(db, (await makeUser(db, role, { name })).id);
  const draft = (author: Awaited<ReturnType<typeof as>>, title = "Editorial workflow story") =>
    createArticle(deps, author, { title, summary: "A summary for the workflow story.", bodyHtml: "<p>Body for the workflow story.</p>", categoryId: techId, tags: [] });
  const act = (ctx: Awaited<ReturnType<typeof as>>, id: string, action: Parameters<typeof applyAction>[3], body: Record<string, unknown>) => applyAction(deps, ctx, id, action, body);
  /** Drives an article to IN_REVIEW and returns it. */
  async function toReview(author: Awaited<ReturnType<typeof as>>, editor: Awaited<ReturnType<typeof as>>) {
    const a = await draft(author);
    await act(author, a.id, "submit", { version: a.version });
    return act(editor, a.id, "start-review", { version: a.version });
  }

  it("runs the whole lifecycle: submit, review, request changes, revise, resubmit, approve, publish", async () => {
    const author = await as("AUTHOR", "Anna Author");
    const editor = await as("EDITOR", "Ed Editor");
    const a = await draft(author);

    const submitted = await act(author, a.id, "submit", { version: 1 });
    expect(submitted.status).toBe("SUBMITTED");
    expect((await listNotifications(deps, editor.id, { page: 1, pageSize: 10, unreadOnly: "false" })).items[0]).toMatchObject({ type: "ARTICLE_SUBMITTED", read: false });
    expect((await listNotifications(deps, author.id, { page: 1, pageSize: 10, unreadOnly: "false" })).items).toHaveLength(0); // no self-notification

    expect((await act(editor, a.id, "start-review", { version: 1 })).status).toBe("IN_REVIEW");
    const changes = await act(editor, a.id, "request-changes", { version: 1, reason: "Please add two named sources." });
    expect(changes.status).toBe("CHANGES_REQUESTED");

    // the author sees the feedback and a notification, edits, and resubmits
    expect((await listReviews(deps, author, a.id))[0]).toMatchObject({ decision: "CHANGES_REQUESTED", reason: "Please add two named sources.", reviewer: { name: "Ed Editor" } });
    const note = (await listNotifications(deps, author.id, { page: 1, pageSize: 10, unreadOnly: "false" })).items[0]!;
    expect(note).toMatchObject({ type: "REVISION_REQUESTED" });
    expect(note.title).toContain("Please add two named sources.");
    const revised = await updateArticle(deps, author, a.id, { version: 1, bodyHtml: "<p>Body with sources: Reuters and AP.</p>", changeNote: "Added sources" });
    expect(revised.version).toBe(2);
    expect((await act(author, a.id, "submit", { version: 2 })).status).toBe("SUBMITTED");
    await act(editor, a.id, "start-review", { version: 2 });

    const approved = await act(editor, a.id, "approve", { version: 2, note: "Good to go." });
    expect(approved.status).toBe("APPROVED");
    expect(approved.publishedAt).toBeNull(); // approved is not public
    await expect(getPublishedBySlug(deps, a.slug)).rejects.toMatchObject({ status: 404 });

    const published = await act(editor, a.id, "publish", { version: 2 });
    expect(published.status).toBe("PUBLISHED");
    expect(published.publishedAt).not.toBeNull();
    expect((await getPublishedBySlug(deps, a.slug)).title).toBe(a.title); // now public

    const types = (await db.notification.findMany({ where: { userId: author.id }, orderBy: { createdAt: "asc" } })).map((n) => n.type);
    expect(types).toEqual(["REVISION_REQUESTED", "ARTICLE_APPROVED", "ARTICLE_PUBLISHED"]);

    // complete history is retained
    expect((await listReviews(deps, editor, a.id)).map((r) => r.decision)).toEqual(["APPROVED", "CHANGES_REQUESTED"]);
    expect((await listRevisions(deps, editor, a.id)).map((r) => [r.version, r.changeNote])).toEqual([[2, "Added sources"], [1, "Created"]]);
    const actions = (await db.auditLog.findMany({ where: { entityType: "Article", entityId: a.id }, orderBy: { createdAt: "asc" } })).map((l) => l.action);
    expect(actions).toEqual(["article.create", "article.submit", "article.start-review", "article.request-changes", "article.update", "article.submit", "article.start-review", "article.approve", "article.publish"]);

    const archived = await act(editor, a.id, "archive", { version: 2 });
    expect(archived.status).toBe("ARCHIVED");
    await expect(getPublishedBySlug(deps, a.slug)).rejects.toMatchObject({ status: 404 });
  });

  it("rejects an article with a reason, archives it and tells the author", async () => {
    const author = await as("AUTHOR");
    const editor = await as("EDITOR");
    const a = await toReview(author, editor);
    await expect(act(editor, a.id, "reject", { version: 1, reason: "short" })).rejects.toBeInstanceOf(ZodError); // route() maps this to 422
    expect((await act(editor, a.id, "reject", { version: 1, reason: "Unverifiable claims throughout." })).status).toBe("ARCHIVED");
    expect((await listReviews(deps, author, a.id))[0]).toMatchObject({ decision: "REJECTED", reason: "Unverifiable claims throughout." });
    expect((await db.notification.findFirstOrThrow({ where: { userId: author.id } })).type).toBe("ARTICLE_REJECTED");
  });

  it("enforces who may do what (404 hides, 403 forbids, 422 blocks bad transitions)", async () => {
    const author = await as("AUTHOR");
    const stranger = await as("AUTHOR");
    const reader = await as("READER");
    const editor = await as("EDITOR");
    const a = await draft(author);

    await expect(act(stranger, a.id, "submit", { version: 1 })).rejects.toMatchObject({ status: 404 }); // cannot even see it
    await expect(act(reader, a.id, "submit", { version: 1 })).rejects.toMatchObject({ status: 404 });
    await expect(act(author, a.id, "publish", { version: 1 })).rejects.toMatchObject({ status: 403 }); // no direct publishing
    await expect(act(author, a.id, "approve", { version: 1 })).rejects.toMatchObject({ status: 403 });
    await expect(act(editor, a.id, "approve", { version: 1 })).rejects.toMatchObject({ code: "INVALID_TRANSITION" }); // still a draft
    await act(author, a.id, "submit", { version: 1 });
    await expect(act(author, a.id, "start-review", { version: 1 })).rejects.toMatchObject({ status: 403 });
    await expect(act(editor, a.id, "publish", { version: 1 })).rejects.toMatchObject({ code: "INVALID_TRANSITION" }); // review cannot be skipped
    await expect(act(author, a.id, "submit", { version: 1 })).rejects.toMatchObject({ code: "INVALID_TRANSITION" }); // already submitted
    await expect(act(editor, a.id, "archive", { version: 1 })).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("separates duties: an editor cannot review their own article, an administrator can", async () => {
    const editor = await as("EDITOR");
    const otherEditor = await as("EDITOR");
    const admin = await as("ADMIN");
    const a = await draft(editor, "Written by an editor");
    await act(editor, a.id, "submit", { version: 1 });
    await expect(act(editor, a.id, "start-review", { version: 1 })).rejects.toMatchObject({ status: 403, message: /own article/ });
    await act(otherEditor, a.id, "start-review", { version: 1 });
    await expect(act(editor, a.id, "approve", { version: 1 })).rejects.toMatchObject({ status: 403 });
    expect((await act(admin, a.id, "approve", { version: 1 })).status).toBe("APPROVED");
    expect((await act(editor, a.id, "publish", { version: 1 })).status).toBe("PUBLISHED"); // publishing an approved piece is fine
  });

  it("only allows direct publishing with the explicit grant, and only from DRAFT", async () => {
    const adminUser = await as("ADMIN");
    const authorUser = await makeUser(db, "AUTHOR");
    let author = await ctxFor(db, authorUser.id);
    const a = await draft(author);
    await expect(act(author, a.id, "publish", { version: 1 })).rejects.toMatchObject({ status: 403 });
    await setAuthorPublishGrant(deps, adminUser, authorUser.id, true);
    author = await ctxFor(db, authorUser.id);
    expect((await act(author, a.id, "publish", { version: 1 })).status).toBe("PUBLISHED");
    await expect(act(author, a.id, "archive", { version: 1 })).rejects.toMatchObject({ status: 403 }); // the grant is for publishing only
  });

  it("uses version checks so a decision applies to the exact version reviewed", async () => {
    const author = await as("AUTHOR");
    const editor = await as("EDITOR");
    const a = await toReview(author, editor);
    await updateArticle(deps, editor, a.id, { version: 1, summary: "Editor tightened the summary text." }); // version -> 2
    await expect(act(editor, a.id, "approve", { version: 1 })).rejects.toMatchObject({ code: "VERSION_CONFLICT", details: { currentVersion: 2 } });
    expect((await act(editor, a.id, "approve", { version: 2 })).status).toBe("APPROVED");
  });

  it("sends an approved or scheduled article back to review when its content changes", async () => {
    const author = await as("AUTHOR");
    const editor = await as("EDITOR");
    const other = await as("EDITOR");
    const a = await toReview(author, editor);
    await act(other, a.id, "approve", { version: 1 });
    const edited = await updateArticle(deps, editor, a.id, { version: 1, title: "A last-minute headline change" });
    expect(edited.status).toBe("IN_REVIEW");
    await act(other, a.id, "approve", { version: 2 });
    const when = new Date(Date.now() + 3600_000).toISOString();
    expect((await act(other, a.id, "schedule", { version: 2, scheduledFor: when })).status).toBe("SCHEDULED");
    const again = await updateArticle(deps, editor, a.id, { version: 2, summary: "Changed after scheduling." });
    expect(again).toMatchObject({ status: "IN_REVIEW", scheduledFor: null });
    expect((await db.auditLog.findMany({ where: { action: "article.update" } })).some((l) => (l.metadata as { approvalReset?: boolean }).approvalReset)).toBe(true);
  });

  it("lets exactly one of two simultaneous decisions win", async () => {
    const author = await as("AUTHOR");
    const editor = await as("EDITOR");
    const other = await as("EDITOR");
    const a = await toReview(author, editor);
    const results = await Promise.allSettled([
      act(editor, a.id, "approve", { version: 1 }),
      act(other, a.id, "request-changes", { version: 1, reason: "Needs more sourcing, sorry." }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.editorialReview.count({ where: { articleId: a.id } })).toBe(1);
  });

  it("schedules with absolute or local+timezone times and validates the window", async () => {
    const author = await as("AUTHOR");
    const editor = await as("EDITOR");
    const other = await as("EDITOR");
    const a = await toReview(author, editor);
    await act(other, a.id, "approve", { version: 1 });
    const bad = (body: Record<string, unknown>) => act(other, a.id, "schedule", { version: 1, ...body });
    await expect(bad({ scheduledFor: new Date(Date.now() - 1000).toISOString() })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(bad({ scheduledFor: new Date(Date.now() + 30_000).toISOString() })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(bad({ scheduledFor: new Date(Date.now() + 400 * 86400_000).toISOString() })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(bad({ localDateTime: "2099-03-08T02:30", timezone: "America/New_York" })).rejects.toMatchObject({ status: 422 }); // DST gap, far future
    await expect(act(author, a.id, "schedule", { version: 1, scheduledFor: new Date(Date.now() + 3600_000).toISOString() })).rejects.toMatchObject({ status: 403 });

    const local = new Date(Date.now() + 2 * 86400_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const wall = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
    const s = await bad({ localDateTime: wall, timezone: "Asia/Kolkata" });
    expect(s.status).toBe("SCHEDULED");
    // wall clock in Kolkata is UTC+5:30, so the instant is 5.5 hours before the same digits read as UTC
    expect(new Date(s.scheduledFor!).getTime()).toBe(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), local.getUTCHours(), local.getUTCMinutes()) - 5.5 * 3600_000);
    await expect(getPublishedBySlug(deps, a.slug)).rejects.toMatchObject({ status: 404 });
    const cancelled = await act(other, a.id, "cancel-schedule", { version: 1 });
    expect(cancelled).toMatchObject({ status: "APPROVED", scheduledFor: null });
  });

  it("refuses to publish or approve into an inactive category", async () => {
    const author = await as("AUTHOR");
    const editor = await as("EDITOR");
    const a = await toReview(author, editor);
    await db.category.update({ where: { id: techId }, data: { isActive: false } });
    await expect(act(editor, a.id, "approve", { version: 1 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("keeps review queues and own-article lists consistent with status", async () => {
    const author = await as("AUTHOR");
    const editor = await as("EDITOR");
    const a = await draft(author);
    await act(author, a.id, "submit", { version: 1 });
    const review = (ctx: typeof editor) => listArticles(deps, ctx, listArticlesQuery.parse({ scope: "review" }));
    expect((await review(editor)).items.map((i) => i.id)).toEqual([a.id]);
    await act(editor, a.id, "start-review", { version: 1 });
    expect((await review(editor)).items).toHaveLength(1); // IN_REVIEW is still in the queue
    await act(editor, a.id, "request-changes", { version: 1, reason: "Needs a stronger intro paragraph." });
    expect((await review(editor)).items).toHaveLength(0);
    expect((await listArticles(deps, author, listArticlesQuery.parse({ scope: "mine", status: "CHANGES_REQUESTED" }))).items).toHaveLength(1);
  });

  it("returns 404 for unknown or deleted articles", async () => {
    const editor = await as("EDITOR");
    await expect(act(editor, "00000000-0000-4000-8000-000000000000", "approve", { version: 1 })).rejects.toMatchObject({ status: 404 });
  });

  describe("scheduler", () => {
    async function scheduled(author: Awaited<ReturnType<typeof as>>, editor: Awaited<ReturnType<typeof as>>, approver: Awaited<ReturnType<typeof as>>, title: string, inMs: number) {
      const a = await draft(author, title);
      await act(author, a.id, "submit", { version: 1 });
      await act(editor, a.id, "start-review", { version: 1 });
      await act(approver, a.id, "approve", { version: 1 });
      await act(approver, a.id, "schedule", { version: 1, scheduledFor: new Date(Date.now() + inMs).toISOString() });
      return a;
    }

    it("publishes only what is due, at the scheduled time, exactly once", async () => {
      const author = await as("AUTHOR");
      const editor = await as("EDITOR");
      const approver = await as("EDITOR");
      const due = await scheduled(author, editor, approver, "Due story", 61_000);
      const later = await scheduled(author, editor, approver, "Later story", 3 * 3600_000);
      const clock = makeClock(new Date(Date.now() + 2 * 60_000));
      const d = makeDeps(db, clock);

      const first = await publishDueArticles(d);
      expect(first).toEqual({ published: [due.id], skipped: [], failed: [] });
      const row = await db.article.findUniqueOrThrow({ where: { id: due.id } });
      expect(row).toMatchObject({ status: "PUBLISHED", scheduledFor: null });
      expect(row.publishedAt!.getTime()).toBeLessThanOrEqual(clock.now.getTime()); // stamped with the scheduled instant
      expect((await db.article.findUniqueOrThrow({ where: { id: later.id } })).status).toBe("SCHEDULED");
      expect((await getPublishedBySlug(d, due.slug)).id).toBe(due.id);

      // idempotent: running again does nothing and sends no second notification
      expect(await publishDueArticles(d)).toEqual({ published: [], skipped: [], failed: [] });
      expect(await db.notification.count({ where: { type: "ARTICLE_PUBLISHED", userId: author.id } })).toBe(1);
      expect(await db.auditLog.count({ where: { action: "article.publish.scheduled" } })).toBe(1);

      clock.advance(4 * 3600_000);
      expect((await publishDueArticles(d)).published).toEqual([later.id]);
    });

    it("is safe when several workers run at once (each article published once)", async () => {
      const author = await as("AUTHOR");
      const editor = await as("EDITOR");
      const approver = await as("EDITOR");
      const ids: string[] = [];
      for (let i = 0; i < 4; i++) ids.push((await scheduled(author, editor, approver, `Concurrent story ${i}`, 61_000)).id);
      const d = makeDeps(db, makeClock(new Date(Date.now() + 5 * 60_000)));
      const runs = await Promise.all([publishDueArticles(d), publishDueArticles(d), publishDueArticles(d)]);
      const published = runs.flatMap((r) => r.published);
      expect(published.sort()).toEqual([...ids].sort());
      expect(new Set(published).size).toBe(ids.length);
      expect(await db.notification.count({ where: { type: "ARTICLE_PUBLISHED" } })).toBe(ids.length);
    });

    it("does not publish an article whose schedule was cancelled or edited meanwhile", async () => {
      const author = await as("AUTHOR");
      const editor = await as("EDITOR");
      const approver = await as("EDITOR");
      const a = await scheduled(author, editor, approver, "Cancelled story", 61_000);
      await act(approver, a.id, "cancel-schedule", { version: 1 });
      const d = makeDeps(db, makeClock(new Date(Date.now() + 5 * 60_000)));
      expect((await publishDueArticles(d)).published).toEqual([]);
      expect((await db.article.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("APPROVED");
    });

    it("on a permanent problem returns the article to APPROVED and alerts the author and editors", async () => {
      const author = await as("AUTHOR");
      const editor = await as("EDITOR");
      const approver = await as("EDITOR");
      const a = await scheduled(author, editor, approver, "Doomed story", 61_000);
      await db.category.update({ where: { id: techId }, data: { isActive: false } });
      const d = makeDeps(db, makeClock(new Date(Date.now() + 5 * 60_000)));
      const res = await publishDueArticles(d);
      expect(res.failed).toEqual([{ id: a.id, reason: "the category is inactive" }]);
      expect(await db.article.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ status: "APPROVED", scheduledFor: null });
      const alerted = await db.notification.findMany({ where: { type: "SCHEDULE_FAILED" } });
      expect(alerted.map((n) => n.userId).sort()).toEqual([author.id, editor.id, approver.id].sort());
      expect(await db.auditLog.count({ where: { action: "article.publish.scheduled_failed" } })).toBe(1);
      expect(await publishDueArticles(d)).toEqual({ published: [], skipped: [], failed: [] }); // no endless retry loop
    });

    it("retries transient database errors with backoff, then gives up and reports", async () => {
      const author = await as("AUTHOR");
      const editor = await as("EDITOR");
      const approver = await as("EDITOR");
      const a = await scheduled(author, editor, approver, "Flaky story", 61_000);
      const base = makeDeps(db, makeClock(new Date(Date.now() + 5 * 60_000)));
      let calls = 0;
      const flaky = new Proxy(db, {
        get(target, prop) {
          if (prop === "$transaction") return (fn: unknown, o?: unknown) => (++calls <= 2 ? Promise.reject(new Error("connection reset")) : (target.$transaction as (f: unknown, o?: unknown) => Promise<unknown>)(fn, o));
          return Reflect.get(target, prop);
        },
      });
      const res = await publishDueArticles({ ...base, db: flaky as PrismaClient }, { backoffMs: 1 });
      expect(res.published).toEqual([a.id]); // succeeded on the 3rd attempt
      expect(calls).toBe(3);
    });
  });

  describe("notifications", () => {
    it("lists newest first with an unread count, and marks only the caller's own as read", async () => {
      const author = await as("AUTHOR");
      const editor = await as("EDITOR");
      const a = await draft(author, "Notification story");
      await act(author, a.id, "submit", { version: 1 });
      await act(editor, a.id, "start-review", { version: 1 });
      await act(editor, a.id, "request-changes", { version: 1, reason: "Please add a second source." });
      await act(author, a.id, "submit", { version: 1 });
      const mine = await listNotifications(deps, editor.id, { page: 1, pageSize: 10, unreadOnly: "false" });
      expect(mine.items.map((n) => n.type)).toEqual(["ARTICLE_SUBMITTED", "ARTICLE_SUBMITTED"]);
      expect(mine.meta).toMatchObject({ unreadCount: 2, total: 2 });

      // someone else cannot mark yours as read, even knowing the ids
      expect(await markNotificationsRead(deps, author.id, { ids: mine.items.map((n) => n.id) })).toEqual({ updated: 0 });
      expect((await listNotifications(deps, editor.id, { page: 1, pageSize: 10, unreadOnly: "true" })).items).toHaveLength(2);
      expect(await markNotificationsRead(deps, editor.id, { ids: [mine.items[0]!.id] })).toEqual({ updated: 1 });
      expect((await listNotifications(deps, editor.id, { page: 1, pageSize: 10, unreadOnly: "true" })).items).toHaveLength(1);
      expect(await markNotificationsRead(deps, editor.id, { all: true })).toEqual({ updated: 1 });
      expect((await listNotifications(deps, editor.id, { page: 1, pageSize: 10, unreadOnly: "false" })).meta.unreadCount).toBe(0);
    });
  });
});
