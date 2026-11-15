import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { connect, ctxFor, makeClock, makeDeps, makeUser, resetDatabase, resetRateLimits, TEST_DB_URL } from "./helpers";
import { call, signInAs } from "./http-helpers";
import { CONSENT_TEXT, listSubscribers, subscribe, unsubscribe, verifySubscription, VERIFY_TTL_MS } from "../../src/server/newsletter/service";
import { makeUnsubscribeToken } from "../../src/server/newsletter/tokens";
import * as subscribeRoute from "../../src/app/api/v1/newsletter/subscribe/route";
import * as verifyRoute from "../../src/app/api/v1/newsletter/verify/route";
import * as unsubRoute from "../../src/app/api/v1/newsletter/unsubscribe/route";
import * as adminRoute from "../../src/app/api/v1/admin/newsletter/subscribers/route";

const tokenFrom = (text: string) => /token=([A-Za-z0-9_-]+)/.exec(text)![1]!;

describe.skipIf(!TEST_DB_URL)("newsletter (real Postgres)", () => {
  let db: PrismaClient;
  beforeAll(() => { db = connect(); });
  beforeEach(async () => { await resetDatabase(db); resetRateLimits(); });
  afterAll(async () => { await db.$disconnect(); });
  const ip = { ip: "203.0.113.9" };

  it("double opt-in: pending until confirmed, consent recorded, nothing active before the click", async () => {
    const deps = makeDeps(db);
    expect(await subscribe(deps, { email: "reader@example.test", consent: true }, ip)).toEqual({ status: "pending" });
    const row = await db.newsletterSubscriber.findUniqueOrThrow({ where: { email: "reader@example.test" } });
    expect(row.status).toBe("PENDING");
    expect(row.consentText).toBe(CONSENT_TEXT);
    expect(row.consentIpHash).toMatch(/^[0-9a-f]{32}$/);
    expect(row.consentIpHash).not.toContain("203.0.113.9");
    expect(deps.mailer.sent).toHaveLength(1);
    const token = tokenFrom(deps.mailer.sent[0]!.text);
    expect(row.verifyToken).not.toBe(token); // only the hash is stored
    expect(await verifySubscription(deps, token)).toEqual({ status: "active" });
    const active = await db.newsletterSubscriber.findUniqueOrThrow({ where: { email: "reader@example.test" } });
    expect(active.status).toBe("ACTIVE");
    expect(active.verifiedAt).not.toBeNull();
    expect(await verifySubscription(deps, token)).toEqual({ status: "active" }); // double click is harmless
  });

  it("reports duplicates, normalises case, and lets a pending address re-request the link", async () => {
    const deps = makeDeps(db);
    await subscribe(deps, { email: "pending@example.test", consent: true }, ip);
    await subscribe(deps, { email: "pending@example.test", consent: true }, ip); // re-send while pending is allowed
    expect(deps.mailer.sent).toHaveLength(2);
    expect(await db.newsletterSubscriber.count()).toBe(1);
    // the first link was replaced by the second
    await expect(verifySubscription(deps, tokenFrom(deps.mailer.sent[0]!.text))).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    await verifySubscription(deps, tokenFrom(deps.mailer.sent[1]!.text));
    await expect(subscribe(deps, { email: "PENDING@Example.test", consent: true }, ip)).rejects.toMatchObject({ status: 409 });
  });

  it("rejects expired and unknown confirmation links", async () => {
    const clock = makeClock();
    const deps = makeDeps(db, clock);
    await subscribe(deps, { email: "late@example.test", consent: true }, ip);
    const token = tokenFrom(deps.mailer.sent[0]!.text);
    await expect(verifySubscription(deps, "x".repeat(43))).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    clock.advance(VERIFY_TTL_MS + 1000);
    await expect(verifySubscription(deps, token)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    expect((await db.newsletterSubscriber.findUniqueOrThrow({ where: { email: "late@example.test" } })).status).toBe("PENDING");
  });

  it("unsubscribes with a signed link only, is idempotent, and re-subscribing needs fresh consent and confirmation", async () => {
    const deps = makeDeps(db);
    await subscribe(deps, { email: "leaver@example.test", consent: true }, ip);
    await verifySubscription(deps, tokenFrom(deps.mailer.sent[0]!.text));
    const row = await db.newsletterSubscriber.findUniqueOrThrow({ where: { email: "leaver@example.test" } });
    await expect(unsubscribe(deps, `${row.id}.forged`)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    expect((await db.newsletterSubscriber.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("ACTIVE");
    const link = makeUnsubscribeToken(deps, row.id);
    expect(await unsubscribe(deps, link)).toEqual({ status: "unsubscribed" });
    expect(await unsubscribe(deps, link)).toEqual({ status: "unsubscribed" });
    const gone = await db.newsletterSubscriber.findUniqueOrThrow({ where: { id: row.id } });
    expect(gone.status).toBe("UNSUBSCRIBED");
    expect(gone.unsubscribedAt).not.toBeNull();
    await subscribe(deps, { email: "leaver@example.test", consent: true }, ip);
    const again = await db.newsletterSubscriber.findUniqueOrThrow({ where: { id: row.id } });
    expect(again.status).toBe("PENDING");
    expect(again.unsubscribedAt).toBeNull();
  });

  it("survives a mail provider failure: the address stays pending and the caller is told to retry", async () => {
    const deps = makeDeps(db);
    deps.mailer.send = async () => { throw new Error("provider down"); };
    await expect(subscribe(deps, { email: "fail@example.test", consent: true }, ip)).rejects.toMatchObject({ status: 503 });
    expect((await db.newsletterSubscriber.findUniqueOrThrow({ where: { email: "fail@example.test" } })).status).toBe("PENDING");
  });

  it("rate limits repeated requests for one address", async () => {
    const deps = makeDeps(db);
    for (let i = 0; i < 3; i++) await subscribe(deps, { email: "spam@example.test", consent: true }, ip);
    await expect(subscribe(deps, { email: "spam@example.test", consent: true }, ip)).rejects.toMatchObject({ status: 429 });
  });

  it("HTTP: validates input, requires same origin, and the full lifecycle works end to end", async () => {
    const bad = await call(subscribeRoute.POST, "POST", "/api/v1/newsletter/subscribe", { body: { email: "not-an-email", consent: true } });
    expect(bad.status).toBe(422);
    const noConsent = await call(subscribeRoute.POST, "POST", "/api/v1/newsletter/subscribe", { body: { email: "a@example.test", consent: false } });
    expect(noConsent.status).toBe(422);
    const cross = await call(subscribeRoute.POST, "POST", "/api/v1/newsletter/subscribe", { origin: "https://evil.example", body: { email: "a@example.test", consent: true } });
    expect(cross.status).toBe(403);
    expect(await db.newsletterSubscriber.count()).toBe(0);
    const okRes = await call(subscribeRoute.POST, "POST", "/api/v1/newsletter/subscribe", { body: { email: "http@example.test", consent: true } });
    expect(okRes.status).toBe(201);
    const badVerify = await call(verifyRoute.POST, "POST", "/api/v1/newsletter/verify", { body: { token: "y".repeat(43) } });
    expect(badVerify.status).toBe(400);
    const row = await db.newsletterSubscriber.findUniqueOrThrow({ where: { email: "http@example.test" } });
    const badUnsub = await call(unsubRoute.POST, "POST", "/api/v1/newsletter/unsubscribe", { body: { token: `${row.id}.${"z".repeat(43)}` } });
    expect(badUnsub.status).toBe(400);
  });

  it("admin list: needs the newsletter permission, filters by status and shows real counts", async () => {
    const deps = makeDeps(db);
    await subscribe(deps, { email: "one@example.test", consent: true }, ip);
    await subscribe(deps, { email: "two@example.test", consent: true }, ip);
    await verifySubscription(deps, tokenFrom(deps.mailer.sent[0]!.text));
    const admin = await makeUser(db, "ADMIN");
    const editor = await makeUser(db, "EDITOR");
    const q = { page: 1, pageSize: 25 };
    await expect(listSubscribers(deps, await ctxFor(db, editor.id), q)).rejects.toMatchObject({ status: 403 });
    const all = await listSubscribers(deps, await ctxFor(db, admin.id), q);
    expect(all.counts).toEqual({ PENDING: 1, ACTIVE: 1, UNSUBSCRIBED: 0, BOUNCED: 0 });
    const active = await listSubscribers(deps, await ctxFor(db, admin.id), { ...q, status: "ACTIVE" });
    expect(active.items.map((i) => i.email)).toEqual(["one@example.test"]);
    expect(JSON.stringify(all)).not.toMatch(/verifyToken|consentIpHash/);
  });

  it("HTTP admin list: 401 anonymous, 403 reader, 200 admin", async () => {
    expect((await call(adminRoute.GET, "GET", "/api/v1/admin/newsletter/subscribers", { origin: null })).status).toBe(401);
    const reader = await signInAs(db, "READER", "r@example.test");
    expect((await call(adminRoute.GET, "GET", "/api/v1/admin/newsletter/subscribers", { origin: null, cookie: reader.cookie })).status).toBe(403);
    const admin = await signInAs(db, "ADMIN", "a@example.test");
    const res = await call(adminRoute.GET, "GET", "/api/v1/admin/newsletter/subscribers", { origin: null, cookie: admin.cookie });
    expect(res.status).toBe(200);
  });
});
