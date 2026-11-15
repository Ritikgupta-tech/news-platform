import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { connect, resetDatabase, resetRateLimits, TEST_DB_URL } from "./helpers";
import { call, params, signInAs } from "./http-helpers";
import * as articles from "../../src/app/api/v1/articles/route";
import * as action from "../../src/app/api/v1/articles/[idOrSlug]/[action]/route";
import * as reviews from "../../src/app/api/v1/articles/[idOrSlug]/reviews/route";
import * as revisions from "../../src/app/api/v1/articles/[idOrSlug]/revisions/route";
import * as article from "../../src/app/api/v1/articles/[idOrSlug]/route";
import * as notifications from "../../src/app/api/v1/notifications/route";
import * as notificationsRead from "../../src/app/api/v1/notifications/read/route";
import * as cron from "../../src/app/api/v1/internal/jobs/publish-scheduled/route";

describe.skipIf(!TEST_DB_URL)("editorial HTTP API (real Postgres)", () => {
  let db: PrismaClient;
  let techId: string;
  beforeAll(() => { db = connect(); });
  beforeEach(async () => { await resetDatabase(db); resetRateLimits(); techId = (await db.category.findUniqueOrThrow({ where: { slug: "technology" } })).id; });
  afterAll(async () => { await db.$disconnect(); });

  const doAction = (cookie: Awaited<ReturnType<typeof signInAs>>["cookie"], id: string, name: string, body: unknown, over: { origin?: string | null } = {}) =>
    call(action.POST, "POST", `/api/v1/articles/${id}/${name}`, { body, cookie, ...over }, params({ idOrSlug: id, action: name }));

  async function team() {
    const author = await signInAs(db, "AUTHOR", "author@example.test", "Anna Author");
    const editor = await signInAs(db, "EDITOR", "editor@example.test", "Ed Editor");
    const approver = await signInAs(db, "EDITOR", "approver@example.test", "Pat Approver");
    const created = await call(articles.POST, "POST", "/api/v1/articles", {
      body: { title: "Story over HTTP workflow", summary: "Summary for the HTTP workflow story.", bodyHtml: "<p>Body.</p>", categoryId: techId }, cookie: author.cookie,
    });
    return { author, editor, approver, id: (await created.json()).data.id as string };
  }

  it("rejects unauthenticated, cross-site, malformed and unknown action requests", async () => {
    const { author, id } = await team();
    expect((await call(action.POST, "POST", `/api/v1/articles/${id}/submit`, { body: { version: 1 } }, params({ idOrSlug: id, action: "submit" }))).status).toBe(401);
    expect((await doAction(author.cookie, id, "submit", { version: 1 }, { origin: "https://evil.test" })).status).toBe(403);
    expect((await doAction(author.cookie, id, "teleport", { version: 1 })).status).toBe(404);
    expect((await doAction(author.cookie, "not-a-uuid", "submit", { version: 1 })).status).toBe(404);
    const noVersion = await doAction(author.cookie, id, "submit", {});
    expect(noVersion.status).toBe(422);
    expect((await noVersion.json()).error.details[0]).toMatchObject({ path: "version" });
    expect((await db.article.findUniqueOrThrow({ where: { id } })).status).toBe("DRAFT"); // nothing changed
  });

  it("runs the lifecycle over HTTP and makes the article public only at the end", async () => {
    const { author, editor, approver, id } = await team();
    const slug = (await db.article.findUniqueOrThrow({ where: { id } })).slug;
    const publicStatus = async () => (await call(article.GET, "GET", `/api/v1/articles/${slug}`, { origin: null }, params({ idOrSlug: slug }))).status;

    expect((await (await doAction(author.cookie, id, "submit", { version: 1 })).json()).data.status).toBe("SUBMITTED");
    expect((await doAction(editor.cookie, id, "start-review", { version: 1 })).status).toBe(200);
    const declined = await doAction(editor.cookie, id, "request-changes", { version: 1, reason: "Needs at least two sources." });
    expect((await declined.json()).data.status).toBe("CHANGES_REQUESTED");

    // the author reads feedback and revision history over the API
    const rev = await call(reviews.GET, "GET", `/api/v1/articles/${id}/reviews`, { cookie: author.cookie, origin: null }, params({ idOrSlug: id }));
    expect((await rev.json()).data[0]).toMatchObject({ decision: "CHANGES_REQUESTED", reason: "Needs at least two sources." });
    const hist = await call(revisions.GET, "GET", `/api/v1/articles/${id}/revisions`, { cookie: author.cookie, origin: null }, params({ idOrSlug: id }));
    expect((await hist.json()).data).toHaveLength(1);

    await call(article.PATCH, "PATCH", `/api/v1/articles/${id}`, { body: { version: 1, bodyHtml: "<p>Now with two sources.</p>" }, cookie: author.cookie }, params({ idOrSlug: id }));
    await doAction(author.cookie, id, "submit", { version: 2 });
    await doAction(approver.cookie, id, "start-review", { version: 2 });
    expect(await publicStatus()).toBe(404);
    expect((await doAction(approver.cookie, id, "approve", { version: 2 })).status).toBe(200);
    expect(await publicStatus()).toBe(404); // approved is not yet public
    const published = await doAction(editor.cookie, id, "publish", { version: 2 });
    expect((await published.json()).data).toMatchObject({ status: "PUBLISHED", version: 2 });
    expect(await publicStatus()).toBe(200);
  });

  it("answers 403 / 404 / 409 / 422 with the standard envelope", async () => {
    const { author, editor, id } = await team();
    const stranger = await signInAs(db, "AUTHOR", "stranger@example.test");
    const err = async (res: Response) => (await res.json()).error;
    expect((await err(await doAction(stranger.cookie, id, "submit", { version: 1 }))).code).toBe("NOT_FOUND");
    expect((await err(await doAction(author.cookie, id, "publish", { version: 1 }))).code).toBe("FORBIDDEN");
    expect((await err(await doAction(editor.cookie, id, "approve", { version: 1 }))).code).toBe("INVALID_TRANSITION");
    expect(await err(await doAction(author.cookie, id, "submit", { version: 7 }))).toMatchObject({ code: "VERSION_CONFLICT", details: { currentVersion: 1 } });
    const bad = await err(await doAction(editor.cookie, id, "schedule", { version: 1, scheduledFor: "tomorrow" }));
    expect(bad.code).toBe("VALIDATION_ERROR");
    // strangers cannot read feedback or history either
    expect((await call(reviews.GET, "GET", `/api/v1/articles/${id}/reviews`, { cookie: stranger.cookie, origin: null }, params({ idOrSlug: id }))).status).toBe(404);
    expect((await call(revisions.GET, "GET", `/api/v1/articles/${id}/revisions`, { origin: null }, params({ idOrSlug: id }))).status).toBe(401);
  });

  it("serves a user's own notifications and lets them mark them read", async () => {
    const { author, editor, id } = await team();
    await doAction(author.cookie, id, "submit", { version: 1 });
    expect((await call(notifications.GET, "GET", "/api/v1/notifications", { origin: null })).status).toBe(401);
    const list = await call(notifications.GET, "GET", "/api/v1/notifications", { cookie: editor.cookie, origin: null });
    expect(list.headers.get("cache-control")).toMatch(/no-store/);
    const body = await list.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ type: "ARTICLE_SUBMITTED", read: false });
    expect(body.meta.unreadCount).toBe(1);
    expect((await (await call(notifications.GET, "GET", "/api/v1/notifications", { cookie: author.cookie, origin: null })).json()).data).toHaveLength(0);

    // the author cannot mark the editor's notification
    const nid = body.data[0].id;
    expect((await (await call(notificationsRead.POST, "POST", "/api/v1/notifications/read", { body: { ids: [nid] }, cookie: author.cookie })).json()).data.updated).toBe(0);
    expect((await call(notificationsRead.POST, "POST", "/api/v1/notifications/read", { body: {}, cookie: editor.cookie })).status).toBe(422);
    expect((await (await call(notificationsRead.POST, "POST", "/api/v1/notifications/read", { body: { all: true }, cookie: editor.cookie })).json()).data.updated).toBe(1);
    expect((await (await call(notifications.GET, "GET", "/api/v1/notifications?unreadOnly=true", { cookie: editor.cookie, origin: null })).json()).data).toHaveLength(0);
  });

  it("protects the scheduler endpoint with a bearer secret and publishes due articles", async () => {
    const { author, editor, approver, id } = await team();
    await doAction(author.cookie, id, "submit", { version: 1 });
    await doAction(editor.cookie, id, "start-review", { version: 1 });
    await doAction(approver.cookie, id, "approve", { version: 1 });
    await doAction(approver.cookie, id, "schedule", { version: 1, scheduledFor: new Date(Date.now() + 61_000).toISOString() });
    await db.article.update({ where: { id }, data: { scheduledFor: new Date(Date.now() - 1000) } }); // time has come

    const job = (headers: Record<string, string>) => call(cron.POST, "POST", "/api/v1/internal/jobs/publish-scheduled", { headers, origin: null });
    expect((await job({})).status).toBe(401);
    expect((await job({ authorization: "Bearer wrong-secret" })).status).toBe(401);
    expect((await job({ authorization: `Basic ${process.env.CRON_SECRET}` })).status).toBe(401);
    expect((await db.article.findUniqueOrThrow({ where: { id } })).status).toBe("SCHEDULED"); // refused calls changed nothing
    const ok = await job({ authorization: `Bearer ${process.env.CRON_SECRET}` });
    expect(ok.status).toBe(200);
    expect((await ok.json()).data).toEqual({ published: [id], skipped: [], failed: [] });
    expect((await db.article.findUniqueOrThrow({ where: { id } })).status).toBe("PUBLISHED");
    expect((await (await job({ authorization: `Bearer ${process.env.CRON_SECRET}` })).json()).data.published).toEqual([]);
  });
});
