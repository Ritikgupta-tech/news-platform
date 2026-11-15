import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { connect, makeUser, resetDatabase, resetRateLimits, TEST_DB_URL } from "./helpers";
import { MemoryMailer, setMailer } from "../../src/server/mail/mailer";
import { hashPassword } from "../../src/server/auth/password";
import { signAccessToken } from "../../src/server/auth/jwt";
import { middleware } from "../../src/middleware";
import * as register from "../../src/app/api/v1/auth/register/route";
import * as login from "../../src/app/api/v1/auth/login/route";
import * as logout from "../../src/app/api/v1/auth/logout/route";
import * as refresh from "../../src/app/api/v1/auth/refresh/route";
import * as me from "../../src/app/api/v1/auth/me/route";
import * as forgot from "../../src/app/api/v1/auth/forgot-password/route";
import * as sessionRefresh from "../../src/app/api/v1/auth/session-refresh/route";
import * as articles from "../../src/app/api/v1/articles/route";
import * as article from "../../src/app/api/v1/articles/[idOrSlug]/route";
import * as categories from "../../src/app/api/v1/categories/route";
import * as adminUsers from "../../src/app/api/v1/admin/users/route";
import * as adminRole from "../../src/app/api/v1/admin/users/[id]/role/route";
import * as auditLogs from "../../src/app/api/v1/admin/audit-logs/route";


import { call, Jar, params, rawCookies, ORIGIN, PW } from "./http-helpers";

describe.skipIf(!TEST_DB_URL)("HTTP layer (route handlers + middleware, real Postgres)", () => {
  let db: PrismaClient;
  let techId: string;
  beforeAll(() => { db = connect(); });
  beforeEach(async () => {
    await resetDatabase(db);
    resetRateLimits();
    setMailer(new MemoryMailer());
    techId = (await db.category.findUniqueOrThrow({ where: { slug: "technology" } })).id;
  });
  afterAll(async () => { setMailer(undefined); await db.$disconnect(); });

  /** Creates a user of the given role with a known password and signs in through the real login route. */
  async function signIn(role: "READER" | "AUTHOR" | "EDITOR" | "ADMIN", email = `${role.toLowerCase()}@example.test`) {
    const user = await makeUser(db, role, { email, passwordHash: await hashPassword(PW) });
    const res = await call(login.POST, "POST", "/api/v1/auth/login", { body: { email, password: PW } });
    expect(res.status).toBe(200);
    return { user, cookie: new Jar().update(res) };
  }

  describe("registration, sessions and cookies", () => {
    it("registers, returns no tokens in the body, and sets hardened cookies", async () => {
      const res = await call(register.POST, "POST", "/api/v1/auth/register", { body: { email: "web@example.test", name: "Web User", password: PW } });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.data.user).toMatchObject({ email: "web@example.test", roles: ["READER"] });
      expect(JSON.stringify(body)).not.toMatch(/token|passwordHash|argon2/i);
      const cookies = rawCookies(res);
      expect(cookies.map((c) => c.split("=")[0]).sort()).toEqual(["enews_at", "enews_rt", "enews_sh"]);
      expect(cookies.every((c) => /HttpOnly/.test(c) && /SameSite=Lax/.test(c))).toBe(true);
      expect(cookies.find((c) => c.startsWith("enews_sh="))).toMatch(/^enews_sh=1;/); // hint carries no secret
      expect(cookies.find((c) => c.startsWith("enews_rt="))).toMatch(/Path=\/api\/v1\/auth/);
      expect(res.headers.get("x-request-id")).toBeTruthy();
    });

    it("blocks cross-site and origin-less state-changing requests (CSRF)", async () => {
      const bad = { email: "csrf@example.test", name: "Csrf", password: PW };
      expect((await call(register.POST, "POST", "/api/v1/auth/register", { body: bad, origin: "https://evil.test" })).status).toBe(403);
      expect((await call(register.POST, "POST", "/api/v1/auth/register", { body: bad, origin: null })).status).toBe(403);
      expect((await call(login.POST, "POST", "/api/v1/auth/login", { body: bad, origin: "https://evil.test" })).status).toBe(403);
      expect(await db.user.count({ where: { email: "csrf@example.test" } })).toBe(0);
    });

    it("returns the standard error envelope for validation, JSON and size problems", async () => {
      const invalid = await call(register.POST, "POST", "/api/v1/auth/register", { body: { email: "nope", name: "x", password: "short" } });
      expect(invalid.status).toBe(422);
      const e = (await invalid.json()).error;
      expect(e.code).toBe("VALIDATION_ERROR");
      expect(e.requestId).toBeTruthy();
      expect(e.details.map((d: { path: string }) => d.path).sort()).toEqual(["email", "name", "password"]);
      const badJson = await register.POST(new Request(`${ORIGIN}/api/v1/auth/register`, { method: "POST", headers: { origin: ORIGIN }, body: "{oops" }), {} as never);
      expect(badJson.status).toBe(422);
      const huge = await register.POST(new Request(`${ORIGIN}/api/v1/auth/register`, { method: "POST", headers: { origin: ORIGIN }, body: JSON.stringify({ pad: "x".repeat(70_000) }) }), {} as never);
      expect(huge.status).toBe(413);
    });

    it("serves /me to signed-in users only, without internals, and never caches it", async () => {
      const anon = await call(me.GET, "GET", "/api/v1/auth/me", { origin: null });
      expect(anon.status).toBe(401);
      expect((await anon.json()).error.code).toBe("UNAUTHENTICATED");
      const { cookie } = await signIn("READER");
      const res = await call(me.GET, "GET", "/api/v1/auth/me", { cookie, origin: null });
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toMatch(/no-store/);
      const { user } = (await res.json()).data;
      expect(user.email).toBe("reader@example.test");
      expect(Object.keys(user)).not.toContain("sessionId");
      expect(Object.keys(user)).not.toContain("passwordHash");
    });

    it("gives a uniform 401 for a wrong password and for an unknown email", async () => {
      await makeUser(db, "READER", { email: "known@example.test", passwordHash: await hashPassword(PW) });
      const a = await call(login.POST, "POST", "/api/v1/auth/login", { body: { email: "known@example.test", password: "wrong-password-1" } });
      const b = await call(login.POST, "POST", "/api/v1/auth/login", { body: { email: "ghost@example.test", password: "wrong-password-1" } });
      expect(a.status).toBe(401);
      expect(b.status).toBe(401);
      const [ea, eb] = [(await a.json()).error, (await b.json()).error];
      expect({ code: ea.code, message: ea.message }).toEqual({ code: eb.code, message: eb.message });
    });

    it("logs out: revokes server-side, clears cookies, and the old cookie stops working", async () => {
      const { cookie } = await signIn("AUTHOR");
      const res = await call(logout.POST, "POST", "/api/v1/auth/logout", { cookie });
      expect(res.status).toBe(204);
      expect(rawCookies(res).every((c) => /Max-Age=0/.test(c))).toBe(true);
      expect((await call(me.GET, "GET", "/api/v1/auth/me", { cookie, origin: null })).status).toBe(401);
    });

    it("logout from a browser form redirects home instead of returning an empty page", async () => {
      const { cookie } = await signIn("READER");
      const res = await call(logout.POST, "POST", "/api/v1/auth/logout", { cookie, headers: { accept: "text/html,application/xhtml+xml" } });
      expect(res.status).toBe(303);
      expect(new URL(res.headers.get("location")!).pathname).toBe("/");
      expect(rawCookies(res).every((c) => /Max-Age=0/.test(c))).toBe(true);
    });

    it("rotates the session through /refresh and clears cookies when the token is invalid", async () => {
      const { cookie } = await signIn("READER");
      const before = cookie.get("enews_rt");
      const first = await call(refresh.POST, "POST", "/api/v1/auth/refresh", { cookie });
      expect(first.status).toBe(200);
      cookie.update(first);
      expect(cookie.get("enews_rt")).not.toBe(before);
      expect((await call(me.GET, "GET", "/api/v1/auth/me", { cookie, origin: null })).status).toBe(200);
      const none = await call(refresh.POST, "POST", "/api/v1/auth/refresh", {});
      expect(none.status).toBe(401);
      expect(rawCookies(none).every((c) => /Max-Age=0/.test(c))).toBe(true);
      const forged = await call(refresh.POST, "POST", "/api/v1/auth/refresh", { cookie: "enews_rt=forged-token-value" });
      expect(forged.status).toBe(401);
    });

    it("answers forgot-password identically for known and unknown emails", async () => {
      await makeUser(db, "READER", { email: "real@example.test" });
      const a = await call(forgot.POST, "POST", "/api/v1/auth/forgot-password", { body: { email: "real@example.test" } });
      const b = await call(forgot.POST, "POST", "/api/v1/auth/forgot-password", { body: { email: "ghost@example.test" } });
      expect([a.status, b.status]).toEqual([202, 202]);
      expect(await a.json()).toEqual(await b.json());
    });
  });

  describe("silent refresh for page navigations", () => {
    const nreq = (cookieHeader: string, path = "/news/x", headers: Record<string, string> = {}) =>
      new NextRequest(`${ORIGIN}${path}`, { headers: { cookie: cookieHeader, ...headers } });
    const passes = (r: Response) => r.headers.get("x-middleware-next") === "1";
    const expiredToken = () => signAccessToken({ userId: "u", sessionId: "s" }, process.env.JWT_ACCESS_SECRET!, 60, Date.now() - 3_600_000);

    it("the refresh token is invisible to page requests (path-scoped), yet the hint cookie reaches them", async () => {
      const { cookie } = await signIn("READER");
      const pageCookies = cookie.header("/news/abc");
      expect(pageCookies).toMatch(/enews_at=/);
      expect(pageCookies).toMatch(/enews_sh=1/);
      expect(pageCookies).not.toMatch(/enews_rt=/);
      expect(cookie.header("/api/v1/auth/session-refresh")).toMatch(/enews_rt=/);
    });

    it("middleware passes anonymous, valid and prefetch requests; redirects expired sessions once", async () => {
      expect(passes(await middleware(nreq("")))).toBe(true);
      const { cookie } = await signIn("READER");
      expect(passes(await middleware(nreq(cookie.header("/news/x"))))).toBe(true); // valid access cookie
      cookie.set("enews_at", await expiredToken());
      const redirect = await middleware(nreq(cookie.header("/news/abc?x=1"), "/news/abc?x=1"));
      expect(redirect.status).toBe(307);
      const loc = new URL(redirect.headers.get("location")!);
      expect(loc.pathname).toBe("/api/v1/auth/session-refresh");
      expect(loc.searchParams.get("next")).toBe("/news/abc?x=1");
      expect(passes(await middleware(nreq(cookie.header("/"), "/", { "next-router-prefetch": "1" })))).toBe(true);
      const anonymousExpired = `enews_at=${await expiredToken()}`; // no hint cookie: nothing to refresh
      expect(passes(await middleware(nreq(anonymousExpired)))).toBe(true);
    });

    it("full browser journey: expired access cookie -> middleware -> refresh route -> original page, signed in", async () => {
      const { cookie } = await signIn("READER");
      const oldRefresh = cookie.get("enews_rt");
      cookie.set("enews_at", await expiredToken()); // 15 minutes later...
      // 1. the page request
      const page = await middleware(nreq(cookie.header("/news/abc"), "/news/abc"));
      expect(page.status).toBe(307);
      const refreshUrl = new URL(page.headers.get("location")!);
      // 2. the browser follows the redirect; now the refresh cookie is in scope
      const res = await call(sessionRefresh.GET, "GET", refreshUrl.pathname + refreshUrl.search, { cookie, origin: null });
      expect(res.status).toBe(303);
      expect(new URL(res.headers.get("location")!).pathname).toBe("/news/abc");
      cookie.update(res);
      expect(cookie.get("enews_rt")).not.toBe(oldRefresh);
      // 3. the retried page request is now authenticated and not redirected again
      expect(passes(await middleware(nreq(cookie.header("/news/abc"), "/news/abc")))).toBe(true);
      expect((await call(me.GET, "GET", "/api/v1/auth/me", { cookie, origin: null })).status).toBe(200);
    });

    it("on a failed refresh the cookies are cleared, so there is no redirect loop", async () => {
      const { cookie } = await signIn("READER");
      cookie.set("enews_at", await expiredToken());
      cookie.set("enews_rt", "revoked-or-forged-token", "/api/v1/auth");
      const res = await call(sessionRefresh.GET, "GET", "/api/v1/auth/session-refresh?next=/", { cookie, origin: null });
      expect(res.status).toBe(303);
      cookie.update(res);
      expect(cookie.has("enews_sh")).toBe(false);
      expect(passes(await middleware(nreq(cookie.header("/"), "/")))).toBe(true);
    });

    it("refuses open redirects", async () => {
      const { cookie } = await signIn("READER");
      for (const next of ["//evil.test/x", "https://evil.test", "/\\evil.test"]) {
        const res = await call(sessionRefresh.GET, "GET", `/api/v1/auth/session-refresh?next=${encodeURIComponent(next)}`, { cookie, origin: null });
        expect(new URL(res.headers.get("location")!).host).toBe("localhost:3000");
        expect(new URL(res.headers.get("location")!).pathname).toBe("/");
        cookie.update(res);
      }
    });
  });

  describe("content API authorization", () => {
    const draft = { title: "HTTP created article", summary: "Summary created over HTTP.", bodyHtml: "<p>Body over HTTP.</p>" };

    it("rejects unauthenticated, reader and cross-site article creation", async () => {
      const body = () => ({ ...draft, categoryId: techId });
      expect((await call(articles.POST, "POST", "/api/v1/articles", { body: body() })).status).toBe(401);
      const reader = await signIn("READER");
      expect((await call(articles.POST, "POST", "/api/v1/articles", { body: body(), cookie: reader.cookie })).status).toBe(403);
      const author = await signIn("AUTHOR");
      expect((await call(articles.POST, "POST", "/api/v1/articles", { body: body(), cookie: author.cookie, origin: "https://evil.test" })).status).toBe(403);
      expect(await db.article.count()).toBe(0);
    });

    it("runs the author flow: create, owner-only read, version-checked update, delete", async () => {
      const author = await signIn("AUTHOR");
      const other = await signIn("AUTHOR", "other-author@example.test");
      const created = await call(articles.POST, "POST", "/api/v1/articles", { body: { ...draft, categoryId: techId, tags: ["HTTP"] }, cookie: author.cookie });
      expect(created.status).toBe(201);
      const a = (await created.json()).data;
      expect(a).toMatchObject({ status: "DRAFT", version: 1 });

      // drafts are invisible to the public and to other authors, visible to the owner
      expect((await call(article.GET, "GET", `/api/v1/articles/${a.slug}`, { origin: null }, params({ idOrSlug: a.slug }))).status).toBe(404);
      expect((await call(article.GET, "GET", `/api/v1/articles/${a.id}`, { origin: null }, params({ idOrSlug: a.id }))).status).toBe(404);
      expect((await call(article.GET, "GET", `/api/v1/articles/${a.id}`, { cookie: other.cookie, origin: null }, params({ idOrSlug: a.id }))).status).toBe(404);
      const own = await call(article.GET, "GET", `/api/v1/articles/${a.id}`, { cookie: author.cookie, origin: null }, params({ idOrSlug: a.id }));
      expect(own.status).toBe(200);
      expect(own.headers.get("cache-control")).toMatch(/private/);

      // IDOR: another author cannot modify or delete it
      expect((await call(article.PATCH, "PATCH", `/api/v1/articles/${a.id}`, { body: { version: 1, title: "Stolen headline text" }, cookie: other.cookie }, params({ idOrSlug: a.id }))).status).toBe(404);
      expect((await call(article.DELETE, "DELETE", `/api/v1/articles/${a.id}`, { cookie: other.cookie }, params({ idOrSlug: a.id }))).status).toBe(404);

      const upd = await call(article.PATCH, "PATCH", `/api/v1/articles/${a.id}`, { body: { version: 1, title: "Retitled by its author" }, cookie: author.cookie }, params({ idOrSlug: a.id }));
      expect(upd.status).toBe(200);
      expect((await upd.json()).data.version).toBe(2);
      const stale = await call(article.PATCH, "PATCH", `/api/v1/articles/${a.id}`, { body: { version: 1, title: "Stale version write" }, cookie: author.cookie }, params({ idOrSlug: a.id }));
      expect(stale.status).toBe(409);
      expect((await stale.json()).error).toMatchObject({ code: "VERSION_CONFLICT", details: { currentVersion: 2 } });

      expect((await call(article.DELETE, "DELETE", `/api/v1/articles/${a.id}`, { cookie: author.cookie }, params({ idOrSlug: a.id }))).status).toBe(204);
      expect((await call(article.GET, "GET", `/api/v1/articles/${a.id}`, { cookie: author.cookie, origin: null }, params({ idOrSlug: a.id }))).status).toBe(404);
    });

    it("serves public lists with caching headers and protects other scopes", async () => {
      const authorUser = await makeUser(db, "AUTHOR");
      await db.article.create({
        data: { slug: "live-http", title: "Live over HTTP", summary: "Summary", bodyHtml: "<p>b</p>", bodyText: "b", status: "PUBLISHED", publishedAt: new Date(Date.now() - 1000), authorId: authorUser.id, categoryId: techId },
      });
      const pub = await call(articles.GET, "GET", "/api/v1/articles?pageSize=5", { origin: null });
      expect(pub.status).toBe(200);
      expect(pub.headers.get("cache-control")).toMatch(/public/);
      const body = await pub.json();
      expect(body.data.map((a: { slug: string }) => a.slug)).toEqual(["live-http"]);
      expect(body.meta).toMatchObject({ total: 1, page: 1 });
      expect(JSON.stringify(body)).not.toContain("bodyHtml"); // list items stay light
      const bySlug = await call(article.GET, "GET", "/api/v1/articles/live-http", { origin: null }, params({ idOrSlug: "live-http" }));
      expect(bySlug.status).toBe(200);
      expect((await call(articles.GET, "GET", "/api/v1/articles?scope=mine", { origin: null })).status).toBe(401);
      const author = await signIn("AUTHOR");
      expect((await call(articles.GET, "GET", "/api/v1/articles?scope=all", { cookie: author.cookie, origin: null })).status).toBe(403);
      expect((await call(articles.GET, "GET", "/api/v1/articles?pageSize=500", { origin: null })).status).toBe(422);
      expect((await call(articles.GET, "GET", "/api/v1/articles?scope=bogus", { origin: null })).status).toBe(422);
    });

    it("lists categories publicly and restricts management", async () => {
      const res = await call(categories.GET, "GET", "/api/v1/categories", { origin: null });
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toMatch(/public/);
      expect((await res.json()).data).toHaveLength(12);
      const reader = await signIn("READER");
      expect((await call(categories.POST, "POST", "/api/v1/categories", { body: { name: "Nope" }, cookie: reader.cookie })).status).toBe(403);
      const editor = await signIn("EDITOR");
      const ok = await call(categories.POST, "POST", "/api/v1/categories", { body: { name: "Fresh Category" }, cookie: editor.cookie });
      expect(ok.status).toBe(201);
    });
  });

  describe("administration API", () => {
    it("is closed to everyone but administrators", async () => {
      expect((await call(adminUsers.GET, "GET", "/api/v1/admin/users", { origin: null })).status).toBe(401);
      for (const role of ["READER", "AUTHOR", "EDITOR"] as const) {
        const { cookie } = await signIn(role);
        expect((await call(adminUsers.GET, "GET", "/api/v1/admin/users", { cookie, origin: null })).status).toBe(403);
        expect((await call(auditLogs.GET, "GET", "/api/v1/admin/audit-logs", { cookie, origin: null })).status).toBe(403);
      }
    });

    it("lets an admin list users and change roles, with validation and audit", async () => {
      const admin = await signIn("ADMIN");
      const target = await makeUser(db, "READER", { email: "promote@example.test" });
      const list = await call(adminUsers.GET, "GET", "/api/v1/admin/users?q=promote", { cookie: admin.cookie, origin: null });
      expect(list.status).toBe(200);
      expect((await list.json()).data).toHaveLength(1);
      const role = (body: unknown, id = target.id) => call(adminRole.PATCH, "PATCH", `/api/v1/admin/users/${id}/role`, { body, cookie: admin.cookie }, params({ id }));
      expect((await role({ roles: ["SUPERUSER"] })).status).toBe(422);
      expect((await role({ roles: [] })).status).toBe(422);
      expect((await role({ roles: ["EDITOR"] }, "not-a-uuid")).status).toBe(404);
      const ok = await role({ roles: ["EDITOR"] });
      expect(ok.status).toBe(200);
      expect((await ok.json()).data.roles.sort()).toEqual(["EDITOR", "READER"]);
      const logs = await call(auditLogs.GET, "GET", "/api/v1/admin/audit-logs?action=user.roles", { cookie: admin.cookie, origin: null });
      expect((await logs.json()).data).toHaveLength(1);
      // CSRF applies to admin writes too
      const csrf = await call(adminRole.PATCH, "PATCH", `/api/v1/admin/users/${target.id}/role`, { body: { roles: ["ADMIN"] }, cookie: admin.cookie, origin: "https://evil.test" }, params({ id: target.id }));
      expect(csrf.status).toBe(403);
    });
  });
});
