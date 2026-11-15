import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { connect, ctxFor, makeClock, makeDeps, makeUser, resetDatabase, resetRateLimits, TEST_DB_URL } from "./helpers";
import { cancelCampaign, createCampaign, getCampaign, listCampaigns, listCampaignsQuery, scheduleCampaign, sendTestCampaign, updateCampaign } from "../../src/server/newsletter/campaigns";
import { sendDueCampaigns } from "../../src/server/newsletter/sender";
import { readUnsubscribeToken } from "../../src/server/newsletter/tokens";
import { unsubscribe } from "../../src/server/newsletter/service";
import { ConsoleMailer, MailError, MemoryMailer, type MailMessage, type Mailer } from "../../src/server/mail/mailer";

const NOW = new Date("2026-11-16T12:00:00.000Z");
const input = { subject: "Weekly digest", body: "Hello readers,\n\nHere is what happened this week. Read more at https://example.test/week." };

describe.skipIf(!TEST_DB_URL)("newsletter campaigns (real Postgres)", () => {
  let db: PrismaClient;
  let clock: ReturnType<typeof makeClock>;
  let deps: ReturnType<typeof makeDeps>;
  beforeAll(() => { db = connect(); });
  beforeEach(async () => { await resetDatabase(db); resetRateLimits(); clock = makeClock(new Date(NOW)); deps = makeDeps(db, clock); });
  afterAll(async () => { await db.$disconnect(); });

  const admin = async () => ctxFor(db, (await makeUser(db, "ADMIN")).id);
  const sub = (email: string, status: "ACTIVE" | "PENDING" | "UNSUBSCRIBED" = "ACTIVE") =>
    db.newsletterSubscriber.create({ data: { email, status, consentAt: new Date(), consentText: "test consent", verifiedAt: status === "ACTIVE" ? new Date() : null } });
  const readyCampaign = async (when?: string) => {
    const ctx = await admin();
    const c = await createCampaign(deps, ctx, input);
    await scheduleCampaign(deps, ctx, c.id, { scheduledAt: when });
    return { ctx, id: c.id };
  };
  /** A mailer whose behaviour per address is scripted. */
  const scripted = (plan: Record<string, (n: number) => "ok" | MailError>): Mailer & { sent: MailMessage[]; calls: Record<string, number> } => {
    const m = { sent: [] as MailMessage[], calls: {} as Record<string, number>, real: true,
      async send(msg: MailMessage) { m.calls[msg.to] = (m.calls[msg.to] ?? 0) + 1; const r = (plan[msg.to] ?? (() => "ok"))(m.calls[msg.to]!); if (r !== "ok") throw r; m.sent.push(msg); return { messageId: "id-" + msg.to }; } };
    return m;
  };

  it("is for newsletter managers only (admins), not editors, authors or readers", async () => {
    for (const role of ["READER", "AUTHOR", "EDITOR"] as const) {
      const ctx = await ctxFor(db, (await makeUser(db, role)).id);
      await expect(createCampaign(deps, ctx, input)).rejects.toMatchObject({ status: 403 });
      await expect(listCampaigns(deps, ctx, listCampaignsQuery.parse({}))).rejects.toMatchObject({ status: 403 });
    }
  });

  it("edits drafts with a version check and locks them once scheduled", async () => {
    const ctx = await admin();
    const c = await createCampaign(deps, ctx, input);
    const edited = await updateCampaign(deps, ctx, c.id, { ...input, subject: "New subject", version: c.version });
    expect(edited.subject).toBe("New subject");
    await expect(updateCampaign(deps, ctx, c.id, { ...input, version: c.version })).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" });
    await scheduleCampaign(deps, ctx, c.id, {});
    const fresh = await getCampaign(deps, ctx, c.id);
    await expect(updateCampaign(deps, ctx, c.id, { ...input, version: fresh.version })).rejects.toMatchObject({ status: 422 });
  });

  it("validates schedule times and transitions", async () => {
    const ctx = await admin();
    const c = await createCampaign(deps, ctx, input);
    await expect(scheduleCampaign(deps, ctx, c.id, { scheduledAt: "2026-11-16T11:00:00.000Z" })).rejects.toMatchObject({ status: 422 });
    await expect(scheduleCampaign(deps, ctx, c.id, { scheduledAt: "2028-01-01T00:00:00.000Z" })).rejects.toMatchObject({ status: 422 });
    await scheduleCampaign(deps, ctx, c.id, { scheduledAt: "2026-11-20T09:00:00.000Z" });
    await expect(scheduleCampaign(deps, ctx, c.id, {})).rejects.toMatchObject({ status: 422 });
    const back = await cancelCampaign(deps, ctx, c.id);
    expect(back).toMatchObject({ status: "DRAFT", scheduledAt: null });
    await expect(cancelCampaign(deps, ctx, c.id)).rejects.toMatchObject({ status: 422 });
    await expect(getCampaign(deps, ctx, "not-a-uuid")).rejects.toMatchObject({ status: 404 });
  });

  it("sends once to active subscribers only, with unsubscribe headers that work, and never twice", async () => {
    const a = await sub("a@example.test"); await sub("b@example.test"); await sub("c@example.test");
    await sub("pending@example.test", "PENDING"); await sub("gone@example.test", "UNSUBSCRIBED");
    const { ctx, id } = await readyCampaign();
    const run = await sendDueCampaigns(deps);
    expect(run.campaigns[0]).toMatchObject({ id, sent: 3, failed: 0, completed: true });
    expect(deps.mailer.sent.map((m) => m.to).sort()).toEqual(["a@example.test", "b@example.test", "c@example.test"]);
    const first = deps.mailer.sent.find((m) => m.to === "a@example.test")!;
    expect(first.html).toContain("https://example.test/week");
    expect(first.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const link = /<([^>]+)>, <([^>]+)>/.exec(first.headers!["List-Unsubscribe"]!)!;
    const token = new URL(link[1]!).searchParams.get("token")!;
    expect(readUnsubscribeToken(deps, token)).toBe(a.id);
    const detail = await getCampaign(deps, ctx, id);
    expect(detail).toMatchObject({ status: "SENT", counts: { sent: 3, total: 3 } });
    expect(detail.sentAt).toBeTruthy();
    deps.mailer.sent.length = 0;
    expect(await sendDueCampaigns(deps)).toEqual({ campaigns: [] });
    expect(deps.mailer.sent).toHaveLength(0);
    // the link in the mail really unsubscribes that person
    await unsubscribe(deps, token);
    expect((await db.newsletterSubscriber.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("UNSUBSCRIBED");
  });

  it("waits for a future send time", async () => {
    await sub("a@example.test");
    await readyCampaign("2026-11-16T13:00:00.000Z");
    expect(await sendDueCampaigns(deps)).toEqual({ campaigns: [] });
    clock.advance(61 * 60_000);
    expect((await sendDueCampaigns(deps)).campaigns[0]).toMatchObject({ sent: 1, completed: true });
  });

  it("skips someone who unsubscribed after the recipient list was frozen", async () => {
    const a = await sub("a@example.test"); const b = await sub("b@example.test");
    const { id } = await readyCampaign();
    await db.newsletterCampaign.update({ where: { id }, data: { status: "SENDING", startedAt: NOW, recipientsAt: NOW } });
    await db.newsletterDelivery.createMany({ data: [{ campaignId: id, subscriberId: a.id }, { campaignId: id, subscriberId: b.id }] });
    await db.newsletterSubscriber.update({ where: { id: b.id }, data: { status: "UNSUBSCRIBED" } });
    const run = await sendDueCampaigns(deps);
    expect(run.campaigns[0]).toMatchObject({ sent: 1, skipped: 1, completed: true });
    expect(deps.mailer.sent.map((m) => m.to)).toEqual(["a@example.test"]);
  });

  it("retries a transient failure on the next run without duplicating anyone", async () => {
    await sub("a@example.test"); await sub("flaky@example.test");
    const m = scripted({ "flaky@example.test": (n) => (n === 1 ? new MailError("busy", "transient") : "ok") });
    const d = { ...deps, mailer: m };
    const { id } = await readyCampaign();
    const r1 = await sendDueCampaigns(d);
    expect(r1.campaigns[0]).toMatchObject({ sent: 1, completed: false });
    expect((await db.newsletterCampaign.findUniqueOrThrow({ where: { id } })).status).toBe("SENDING");
    const r2 = await sendDueCampaigns(d);
    expect(r2.campaigns[0]).toMatchObject({ sent: 1, completed: true });
    expect(m.calls).toEqual({ "a@example.test": 1, "flaky@example.test": 2 });
  });

  it("gives up on a transient failure after 3 attempts", async () => {
    await sub("a@example.test"); await sub("bad@example.test");
    const m = scripted({ "bad@example.test": () => new MailError("busy", "transient") });
    const d = { ...deps, mailer: m };
    const { ctx, id } = await readyCampaign();
    for (let i = 0; i < 3; i++) await sendDueCampaigns(d);
    const detail = await getCampaign(deps, ctx, id);
    expect(detail).toMatchObject({ status: "SENT", counts: { sent: 1, failed: 1 } });
    expect(detail.failures[0]).toMatchObject({ email: "bad@example.test", attempts: 3 });
  });

  it("marks a rejected address failed without touching its subscription or blocking the others", async () => {
    await sub("a@example.test"); const bad = await sub("bad@example.test");
    const m = scripted({ "bad@example.test": () => new MailError("rejected", "recipient") });
    const { ctx, id } = await readyCampaign();
    const run = await sendDueCampaigns({ ...deps, mailer: m });
    expect(run.campaigns[0]).toMatchObject({ sent: 1, failed: 1, completed: true });
    expect((await getCampaign(deps, ctx, id)).counts).toMatchObject({ sent: 1, failed: 1 });
    expect((await db.newsletterSubscriber.findUniqueOrThrow({ where: { id: bad.id } })).status).toBe("ACTIVE");
  });

  it("stops on a settings problem and leaves everything queued, blaming nobody", async () => {
    await sub("a@example.test"); await sub("b@example.test");
    const m = scripted({ "a@example.test": () => new MailError("bad key", "config"), "b@example.test": () => new MailError("bad key", "config") });
    const { ctx, id } = await readyCampaign();
    const run = await sendDueCampaigns({ ...deps, mailer: m });
    expect(run.aborted).toContain("Mail settings problem");
    const detail = await getCampaign(deps, ctx, id);
    expect(detail.status).toBe("SENDING");
    expect(detail.counts).toMatchObject({ pending: 2, failed: 0, sent: 0 });
    const rows = await db.newsletterDelivery.findMany({ where: { campaignId: id } });
    expect(rows.every((r) => r.attempts === 0)).toBe(true);
    // fixed settings: the same campaign finishes
    expect((await sendDueCampaigns(deps)).campaigns[0]).toMatchObject({ sent: 2, completed: true });
  });

  it("stops after five failures in a row", async () => {
    for (let i = 0; i < 8; i++) await sub(`u${i}@example.test`);
    const m = scripted(Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`u${i}@example.test`, () => new MailError("down", "transient")])));
    const { id } = await readyCampaign();
    const run = await sendDueCampaigns({ ...deps, mailer: m }, { concurrency: 5 });
    expect(run.aborted).toContain("5 failures in a row");
    expect(Object.values(m.calls).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(5);
    expect((await db.newsletterCampaign.findUniqueOrThrow({ where: { id } })).status).toBe("SENDING");
  });

  it("does not resend something a crashed worker left in flight", async () => {
    const a = await sub("a@example.test");
    const { ctx, id } = await readyCampaign();
    await db.newsletterCampaign.update({ where: { id }, data: { status: "SENDING", startedAt: NOW, recipientsAt: NOW } });
    await db.newsletterDelivery.create({ data: { campaignId: id, subscriberId: a.id, status: "SENDING", attempts: 1, claimedAt: new Date(NOW.getTime() - 30 * 60_000) } });
    const run = await sendDueCampaigns(deps);
    expect(deps.mailer.sent).toHaveLength(0);
    expect(run.campaigns[0]).toMatchObject({ completed: true });
    const detail = await getCampaign(deps, ctx, id);
    expect(detail.counts.failed).toBe(1);
    expect(detail.failures[0]?.error).toContain("Outcome unknown");
  });

  it("cancelling a running campaign skips what is left", async () => {
    const a = await sub("a@example.test"); const b = await sub("b@example.test");
    const { ctx, id } = await readyCampaign();
    await db.newsletterCampaign.update({ where: { id }, data: { status: "SENDING", startedAt: NOW, recipientsAt: NOW } });
    await db.newsletterDelivery.createMany({ data: [{ campaignId: id, subscriberId: a.id, status: "SENT", sentAt: NOW }, { campaignId: id, subscriberId: b.id }] });
    const out = await cancelCampaign(deps, ctx, id);
    expect(out.status).toBe("CANCELLED");
    expect(out.counts).toMatchObject({ sent: 1, skipped: 1, pending: 0 });
    expect(await sendDueCampaigns(deps)).toEqual({ campaigns: [] });
    expect(deps.mailer.sent).toHaveLength(0);
  });

  it("refuses to mark a campaign sent through the console mailer in production", async () => {
    await sub("a@example.test");
    const { id } = await readyCampaign();
    const prod = { ...deps, env: { ...deps.env, NODE_ENV: "production" as const }, mailer: new ConsoleMailer(false) };
    const run = await sendDueCampaigns(prod);
    expect(run.aborted).toContain("No mail provider");
    expect((await db.newsletterCampaign.findUniqueOrThrow({ where: { id } })).status).toBe("SCHEDULED");
  });

  it("sends tests only to the caller, without unsubscribe headers", async () => {
    const ctx = await admin();
    const c = await createCampaign(deps, ctx, input);
    expect(await sendTestCampaign(deps, ctx, c.id)).toEqual({ sentTo: ctx.email });
    const m = (deps.mailer as MemoryMailer).sent[0]!;
    expect(m.to).toBe(ctx.email);
    expect(m.subject).toBe("[Test] Weekly digest");
    expect(m.headers).toBeUndefined();
    expect((await db.newsletterDelivery.count())).toBe(0);
  });
});
