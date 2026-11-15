import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { connect, makeArticle, makeUser, resetDatabase, resetRateLimits, TEST_DB_URL } from "./helpers";
import { call, params, PW, rawCookies, signInAs } from "./http-helpers";
import * as bookmarks from "../../src/app/api/v1/bookmarks/route";
import * as bookmark from "../../src/app/api/v1/bookmarks/[articleId]/route";
import * as history from "../../src/app/api/v1/reading-history/route";
import * as historyItem from "../../src/app/api/v1/reading-history/[articleId]/route";
import * as prefs from "../../src/app/api/v1/preferences/route";
import * as account from "../../src/app/api/v1/account/route";
import * as password from "../../src/app/api/v1/account/password/route";
import * as revoke from "../../src/app/api/v1/account/sessions/revoke-others/route";
import * as exportRoute from "../../src/app/api/v1/account/export/route";
import * as del from "../../src/app/api/v1/account/delete/route";
import * as me from "../../src/app/api/v1/auth/me/route";
import * as login from "../../src/app/api/v1/auth/login/route";

describe.skipIf(!TEST_DB_URL)("reader and account HTTP API (real Postgres)", () => {
  let db: PrismaClient;
  beforeAll(() => { db = connect(); });
  beforeEach(async () => { await resetDatabase(db); resetRateLimits(); });
  afterAll(async () => { await db.$disconnect(); });

  async function setup() {
    const author = await makeUser(db, "AUTHOR");
    const art = await makeArticle(db, { authorId: author.id, title: "HTTP reader story" });
    const alice = await signInAs(db, "READER", "alice@example.test", "Alice Reader");
    const bob = await signInAs(db, "READER", "bob@example.test", "Bob Reader");
    return { art, alice, bob };
  }

  it("requires sign-in and a same-origin request for every endpoint", async () => {
    const { art, alice } = await setup();
    const id = art.id;
    const anon: [string, () => Promise<Response>][] = [
      ["GET bookmarks", () => call(bookmarks.GET, "GET", "/api/v1/bookmarks", { origin: null })],
      ["POST bookmarks", () => call(bookmarks.POST, "POST", "/api/v1/bookmarks", { body: { articleId: id } })],
      ["DELETE bookmark", () => call(bookmark.DELETE, "DELETE", `/api/v1/bookmarks/${id}`, {}, params({ articleId: id }))],
      ["GET history", () => call(history.GET, "GET", "/api/v1/reading-history", { origin: null })],
      ["POST history", () => call(history.POST, "POST", "/api/v1/reading-history", { body: { articleId: id } })],
      ["DELETE history", () => call(history.DELETE, "DELETE", "/api/v1/reading-history", {})],
      ["GET preferences", () => call(prefs.GET, "GET", "/api/v1/preferences", { origin: null })],
      ["PUT preferences", () => call(prefs.PUT, "PUT", "/api/v1/preferences", { body: {} })],
      ["PATCH account", () => call(account.PATCH, "PATCH", "/api/v1/account", { body: { name: "Someone Else" } })],
      ["POST password", () => call(password.POST, "POST", "/api/v1/account/password", { body: { currentPassword: PW, newPassword: "another long passphrase" } })],
      ["POST revoke", () => call(revoke.POST, "POST", "/api/v1/account/sessions/revoke-others", {})],
      ["GET export", () => call(exportRoute.GET, "GET", "/api/v1/account/export", { origin: null })],
      ["POST delete", () => call(del.POST, "POST", "/api/v1/account/delete", { body: { password: PW, confirm: "DELETE" } })],
    ];
    for (const [name, run] of anon) expect((await run()).status, `${name} (anonymous)`).toBe(401);
    // signed in but from another site: blocked before anything happens
    const evil = { cookie: alice.cookie, origin: "https://evil.test" };
    expect((await call(bookmarks.POST, "POST", "/api/v1/bookmarks", { ...evil, body: { articleId: id } })).status).toBe(403);
    expect((await call(del.POST, "POST", "/api/v1/account/delete", { ...evil, body: { password: PW, confirm: "DELETE" } })).status).toBe(403);
    expect((await call(account.PATCH, "PATCH", "/api/v1/account", { ...evil, body: { name: "Hijacked Name" } })).status).toBe(403);
    expect(await db.user.count({ where: { email: "alice@example.test", deletedAt: null } })).toBe(1);
    expect(await db.bookmark.count()).toBe(0);
  });

  it("bookmarks: save, list, remove, with validation and isolation", async () => {
    const { art, alice, bob } = await setup();
    const save = await call(bookmarks.POST, "POST", "/api/v1/bookmarks", { body: { articleId: art.id }, cookie: alice.cookie });
    expect(save.status).toBe(201);
    expect((await save.json()).data).toEqual({ bookmarked: true });
    expect((await call(bookmarks.POST, "POST", "/api/v1/bookmarks", { body: { articleId: "nope" }, cookie: alice.cookie })).status).toBe(422);
    expect((await call(bookmarks.POST, "POST", "/api/v1/bookmarks", { body: { articleId: "00000000-0000-4000-8000-000000000000" }, cookie: alice.cookie })).status).toBe(404);
    const list = await call(bookmarks.GET, "GET", "/api/v1/bookmarks", { cookie: alice.cookie, origin: null });
    expect(list.headers.get("cache-control")).toMatch(/no-store/);
    const body = await list.json();
    expect(body.data.map((a: { id: string }) => a.id)).toEqual([art.id]);
    expect(body.meta.total).toBe(1);
    expect((await (await call(bookmarks.GET, "GET", "/api/v1/bookmarks", { cookie: bob.cookie, origin: null })).json()).data).toHaveLength(0);
    // bob cannot remove alice's; the bookmark survives
    await call(bookmark.DELETE, "DELETE", `/api/v1/bookmarks/${art.id}`, { cookie: bob.cookie }, params({ articleId: art.id }));
    expect(await db.bookmark.count()).toBe(1);
    expect((await call(bookmark.DELETE, "DELETE", "/api/v1/bookmarks/not-a-uuid", { cookie: alice.cookie }, params({ articleId: "not-a-uuid" }))).status).toBe(404);
    const rm = await call(bookmark.DELETE, "DELETE", `/api/v1/bookmarks/${art.id}`, { cookie: alice.cookie }, params({ articleId: art.id }));
    expect((await rm.json()).data).toEqual({ bookmarked: false });
    expect(await db.bookmark.count()).toBe(0);
  });

  it("reading history and preferences work end to end", async () => {
    const { art, alice } = await setup();
    const rec = await call(history.POST, "POST", "/api/v1/reading-history", { body: { articleId: art.id }, cookie: alice.cookie });
    expect((await rec.json()).data).toEqual({ recorded: true });
    expect((await (await call(history.GET, "GET", "/api/v1/reading-history", { cookie: alice.cookie, origin: null })).json()).data).toHaveLength(1);

    const tech = (await db.category.findUniqueOrThrow({ where: { slug: "technology" } })).id;
    const put = await call(prefs.PUT, "PUT", "/api/v1/preferences", { body: { interests: [tech], recordReadingHistory: false }, cookie: alice.cookie });
    expect((await put.json()).data).toMatchObject({ recordReadingHistory: false, interests: [{ slug: "technology" }] });
    expect((await call(prefs.PUT, "PUT", "/api/v1/preferences", { body: { interests: ["x"] }, cookie: alice.cookie })).status).toBe(422);
    expect((await call(prefs.PUT, "PUT", "/api/v1/preferences", { body: { recordReadingHistory: "yes" }, cookie: alice.cookie })).status).toBe(422);
    expect((await (await call(history.POST, "POST", "/api/v1/reading-history", { body: { articleId: art.id }, cookie: alice.cookie })).json()).data).toEqual({ recorded: false });
    const cleared = await call(history.DELETE, "DELETE", "/api/v1/reading-history", { cookie: alice.cookie });
    expect((await cleared.json()).data).toEqual({ removed: 1 });
    expect((await call(historyItem.DELETE, "DELETE", "/api/v1/reading-history/bad", { cookie: alice.cookie }, params({ articleId: "bad" }))).status).toBe(404);
  });

  it("profile, password and sessions", async () => {
    const { alice } = await setup();
    const upd = await call(account.PATCH, "PATCH", "/api/v1/account", { body: { name: "Alice Renamed", timezone: "Asia/Kolkata" }, cookie: alice.cookie });
    expect((await upd.json()).data.user).toMatchObject({ name: "Alice Renamed", timezone: "Asia/Kolkata" });
    expect((await call(account.PATCH, "PATCH", "/api/v1/account", { body: {}, cookie: alice.cookie })).status).toBe(422);
    expect((await call(account.PATCH, "PATCH", "/api/v1/account", { body: { timezone: "Nope/Nope" }, cookie: alice.cookie })).status).toBe(422);

    // a second device
    const second = await call(login.POST, "POST", "/api/v1/auth/login", { body: { email: "alice@example.test", password: PW } });
    const otherCookie = rawCookies(second).map((c) => c.split(";")[0]).join("; ");
    const wrong = await call(password.POST, "POST", "/api/v1/account/password", { body: { currentPassword: "not-the-password", newPassword: "another long passphrase" }, cookie: alice.cookie });
    expect(wrong.status).toBe(422);
    expect((await wrong.json()).error.details[0].path).toBe("currentPassword");
    const ok = await call(password.POST, "POST", "/api/v1/account/password", { body: { currentPassword: PW, newPassword: "another long passphrase" }, cookie: alice.cookie });
    expect(ok.status).toBe(200);
    expect((await ok.json()).data.otherSessionsRevoked).toBe(1);
    expect((await call(me.GET, "GET", "/api/v1/auth/me", { cookie: alice.cookie, origin: null })).status).toBe(200);
    expect((await call(me.GET, "GET", "/api/v1/auth/me", { cookie: otherCookie, origin: null })).status).toBe(401);
    const sign = await call(revoke.POST, "POST", "/api/v1/account/sessions/revoke-others", { cookie: alice.cookie });
    expect((await sign.json()).data).toEqual({ revoked: 0 });
  });

  it("exports a downloadable file without secrets", async () => {
    const { alice } = await setup();
    const res = await call(exportRoute.GET, "GET", "/api/v1/account/export", { cookie: alice.cookie, origin: null });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="my-data-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    const text = await res.text();
    expect(JSON.parse(text).profile.email).toBe("alice@example.test");
    expect(text).not.toMatch(/passwordHash|argon2|refreshTokenHash/);
  });

  it("deletes the account only with the right password and confirmation, and ends the session", async () => {
    const { alice } = await setup();
    const del1 = (body: unknown) => call(del.POST, "POST", "/api/v1/account/delete", { body, cookie: alice.cookie });
    expect((await del1({ password: PW })).status).toBe(422);
    expect((await del1({ password: PW, confirm: "delete" })).status).toBe(422);
    expect((await del1({ password: "wrong-password-xx", confirm: "DELETE" })).status).toBe(422);
    expect(await db.user.count({ where: { email: "alice@example.test", deletedAt: null } })).toBe(1);
    const ok = await del1({ password: PW, confirm: "DELETE" });
    expect(ok.status).toBe(204);
    expect(rawCookies(ok).every((c) => /Max-Age=0/.test(c))).toBe(true);
    expect((await call(me.GET, "GET", "/api/v1/auth/me", { cookie: alice.cookie, origin: null })).status).toBe(401);
    expect((await call(login.POST, "POST", "/api/v1/auth/login", { body: { email: "alice@example.test", password: PW } })).status).toBe(401);
  });
});
