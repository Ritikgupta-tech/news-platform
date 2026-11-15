import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiError } from "../src/lib/api/errors";
import { readJson } from "../src/lib/api/request";
import { sanitizeArticleHtml, htmlToText } from "../src/server/content/sanitize";
import { burnVerify, hashPassword, passwordSchema, verifyPassword } from "../src/server/auth/password";
import { generateOpaqueToken, sha256 } from "../src/server/auth/tokens";
import { signAccessToken, verifyAccessToken } from "../src/server/auth/jwt";
import { clearSessionCookies, parseCookies, sessionCookies } from "../src/server/auth/cookies";
import { assertSameOrigin } from "../src/server/security/csrf";
import { MemoryRateLimiter, clientIp } from "../src/server/security/rate-limit";
import { canViewUnpublished, decideDelete, decideEdit } from "../src/server/articles/policy";
import { safeNextPath } from "../src/server/auth/http";

describe("HTML sanitizer", () => {
  it("removes scripts, handlers, iframes, styles and javascript: URLs", () => {
    const dirty =
      '<p onclick="x()">Hi</p><script>alert(1)</script><iframe src="https://evil"></iframe>' +
      '<a href="javascript:alert(1)">bad</a><p style="position:fixed">s</p><img src=x onerror=alert(1)>';
    const clean = sanitizeArticleHtml(dirty);
    expect(clean).not.toMatch(/script|onclick|onerror|iframe|javascript:|style=/i);
    expect(clean).toContain("<p>Hi</p>");
  });
  it("keeps safe formatting and hardens links", () => {
    const clean = sanitizeArticleHtml('<h1>T</h1><p><strong>b</strong> <a href="https://example.com" target="_blank">l</a></p>');
    expect(clean).toContain("<h2>T</h2>"); // h1 is reserved for the page title
    expect(clean).toContain('rel="noopener noreferrer nofollow"');
    expect(clean).toContain('target="_blank"');
  });
  it("allows only https images", () => {
    expect(sanitizeArticleHtml('<img src="http://a.test/x.png" alt="a">')).not.toContain("src=");
    expect(sanitizeArticleHtml('<img src="https://a.test/x.png" alt="a">')).toContain('src="https://a.test/x.png"');
    expect(sanitizeArticleHtml('<img src="data:image/png;base64,AAAA">')).not.toContain("data:");
  });
  it("blocks protocol-relative URLs", () => {
    expect(sanitizeArticleHtml('<a href="//evil.test/x">x</a>')).not.toContain("evil.test");
  });
  it("drops empty paragraphs but keeps a paragraph that only holds an image", () => {
    expect(sanitizeArticleHtml("<p>One</p><p></p><p> </p><p><br></p><p>Two</p><p></p>")).toBe("<p>One</p><p>Two</p>");
    expect(sanitizeArticleHtml('<p><img src="https://a.test/x.png" alt="x"></p>')).toContain("<img");
  });
  it("extracts plain text with entities decoded", () => {
    expect(htmlToText("<p>Tom &amp; Jerry</p><p>Second</p>")).toBe("Tom & Jerry Second");
  });
});

describe("passwords", () => {
  it("uses Argon2id and verifies correctly", async () => {
    const h = await hashPassword("a-long-enough-password");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "a-long-enough-password")).toBe(true);
    expect(await verifyPassword(h, "wrong-password-here")).toBe(false);
    expect(await verifyPassword("garbage", "x")).toBe(false);
    await expect(burnVerify("x")).resolves.toBeUndefined();
  });
  it("enforces the policy", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("Password123").success).toBe(false);
    expect(passwordSchema.safeParse("x".repeat(129)).success).toBe(false);
    expect(passwordSchema.safeParse("correct horse battery").success).toBe(true);
  });
});

describe("tokens", () => {
  const secret = "s".repeat(40);
  it("round-trips and rejects wrong secret, tampering and expiry", async () => {
    const t = await signAccessToken({ userId: "u1", sessionId: "s1" }, secret);
    expect(await verifyAccessToken(t, secret)).toEqual({ userId: "u1", sessionId: "s1" });
    expect(await verifyAccessToken(t, "x".repeat(40))).toBeNull();
    expect(await verifyAccessToken(t.slice(0, -2) + "xx", secret)).toBeNull();
    const old = await signAccessToken({ userId: "u1", sessionId: "s1" }, secret, 60, Date.now() - 3_600_000);
    expect(await verifyAccessToken(old, secret)).toBeNull();
    expect(await verifyAccessToken("not.a.jwt", secret)).toBeNull();
  });
  it("rejects an unsigned (alg=none) token", async () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const forged = `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: "u1", sid: "s1", iss: "enews", aud: "enews-web", exp: 9_999_999_999 })}.`;
    expect(await verifyAccessToken(forged, secret)).toBeNull();
  });
  it("generates unique opaque tokens and stores only hashes", () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(sha256(a.token));
    expect(a.token.length).toBeGreaterThanOrEqual(43);
  });
});

describe("cookies", () => {
  it("parses cookie headers safely", () => {
    expect(parseCookies("a=1; b=hello%20world; bad=%E0%A4%A; c=3")).toMatchObject({ a: "1", b: "hello world", c: "3" });
    expect(parseCookies(null)).toEqual({});
  });
  it("sets HttpOnly, SameSite and scoped paths; Secure only when asked", () => {
    const [access, refresh] = sessionCookies("AT", "RT", true);
    expect(access).toMatch(/HttpOnly/);
    expect(access).toMatch(/SameSite=Lax/);
    expect(access).toMatch(/Secure/);
    expect(access).toMatch(/Path=\//);
    expect(refresh).toMatch(/Path=\/api\/v1\/auth/);
    expect(sessionCookies("AT", "RT", false)[0]).not.toMatch(/Secure/);
    expect(sessionCookies("AT", "RT", true)).toHaveLength(3);
    expect(clearSessionCookies(false).every((c) => /Max-Age=0/.test(c))).toBe(true);
  });
});

describe("CSRF origin check", () => {
  const app = "http://localhost:3000";
  const req = (method: string, headers: Record<string, string> = {}) => new Request(`${app}/api/v1/x`, { method, headers });
  it("allows safe methods and same-origin writes", () => {
    expect(() => assertSameOrigin(req("GET"), app)).not.toThrow();
    expect(() => assertSameOrigin(req("POST", { origin: app }), app)).not.toThrow();
    expect(() => assertSameOrigin(req("POST", { "sec-fetch-site": "same-origin" }), app)).not.toThrow();
  });
  it("blocks cross-origin, missing-origin and cross-site writes", () => {
    for (const r of [req("POST", { origin: "https://evil.test" }), req("DELETE"), req("PATCH", { "sec-fetch-site": "cross-site" }), req("POST", { origin: "null" })]) {
      expect(() => assertSameOrigin(r, app)).toThrowError(ApiError);
    }
  });
});

describe("rate limiter", () => {
  it("limits per window and resets", async () => {
    let t = 1_000;
    const rl = new MemoryRateLimiter(() => t);
    for (let i = 0; i < 3; i++) expect((await rl.hit("k", 3, 60_000)).allowed).toBe(true);
    const blocked = await rl.hit("k", 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(60);
    expect((await rl.hit("other", 3, 60_000)).allowed).toBe(true);
    t += 60_001;
    expect((await rl.hit("k", 3, 60_000)).allowed).toBe(true);
  });
  it("trusts X-Forwarded-For only when told to", () => {
    const r = new Request("http://x.test", { headers: { "x-forwarded-for": "9.9.9.9, 1.1.1.1" } });
    expect(clientIp(r, false)).toBe("unknown");
    expect(clientIp(r, true)).toBe("9.9.9.9");
  });
});

describe("article policy", () => {
  const author = { id: "a1", roles: ["READER", "AUTHOR"] };
  const other = { id: "a2", roles: ["READER", "AUTHOR"] };
  const editor = { id: "e1", roles: ["READER", "AUTHOR", "EDITOR"] };
  const reader = { id: "r1", roles: ["READER"] };
  const art = (status: "DRAFT" | "SUBMITTED" | "CHANGES_REQUESTED" | "PUBLISHED" | "ARCHIVED") => ({ authorId: "a1", status });

  it("lets authors edit only their own draft or changes-requested article", () => {
    expect(decideEdit(author, art("DRAFT"))).toEqual({ ok: true });
    expect(decideEdit(author, art("CHANGES_REQUESTED"))).toEqual({ ok: true });
    expect(decideEdit(author, art("SUBMITTED"))).toEqual({ ok: false, reason: "status" });
    expect(decideEdit(author, art("PUBLISHED"))).toEqual({ ok: false, reason: "status" });
  });
  it("hides other people's articles from authors and readers (IDOR)", () => {
    expect(decideEdit(other, art("DRAFT"))).toEqual({ ok: false, reason: "not_found" });
    expect(decideEdit(reader, art("DRAFT"))).toEqual({ ok: false, reason: "not_found" });
    expect(canViewUnpublished(other, art("DRAFT"))).toBe(false);
    expect(canViewUnpublished(reader, art("DRAFT"))).toBe(false);
  });
  it("lets editors edit any non-archived article", () => {
    expect(decideEdit(editor, art("SUBMITTED"))).toEqual({ ok: true });
    expect(decideEdit(editor, art("PUBLISHED"))).toEqual({ ok: true });
    expect(decideEdit(editor, art("ARCHIVED"))).toEqual({ ok: false, reason: "status" });
    expect(canViewUnpublished(editor, art("DRAFT"))).toBe(true);
  });
  it("restricts deletion", () => {
    expect(decideDelete(author, art("DRAFT"))).toEqual({ ok: true });
    expect(decideDelete(author, art("SUBMITTED"))).toEqual({ ok: false, reason: "status" });
    expect(decideDelete(other, art("DRAFT"))).toEqual({ ok: false, reason: "not_found" });
    expect(decideDelete(editor, art("DRAFT"))).toEqual({ ok: false, reason: "not_found" });
    expect(decideDelete({ id: "x", roles: ["ADMIN"] }, art("PUBLISHED"))).toEqual({ ok: true });
  });
});

describe("redirect safety", () => {
  it("accepts only same-site relative paths", () => {
    expect(safeNextPath("/news/a?b=1")).toBe("/news/a?b=1");
    for (const bad of ["//evil.test", "https://evil.test", "/\\evil.test", "javascript:alert(1)", "", null, undefined, "/a\nb"]) {
      expect(safeNextPath(bad as string | null)).toBe("/");
    }
  });
});

describe("readJson", () => {
  const post = (body: string, headers: Record<string, string> = {}) => new Request("http://x.test", { method: "POST", body, headers });
  const schema = z.object({ a: z.number() });
  it("parses valid JSON and rejects bad, oversized and invalid bodies", async () => {
    expect(await readJson(post('{"a":1}'), schema)).toEqual({ a: 1 });
    await expect(readJson(post("{nope"), schema)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(readJson(post('{"a":"x"}'), schema)).rejects.toBeInstanceOf(z.ZodError);
    await expect(readJson(post(JSON.stringify({ a: 1, pad: "x".repeat(200) })), schema, 100)).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
    await expect(readJson(post("{}", { "content-length": "999999" }), schema, 100)).rejects.toMatchObject({ status: 413 });
  });
});
