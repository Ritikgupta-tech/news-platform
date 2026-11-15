import { Prisma, SubscriberStatus } from "@prisma/client";
import { z } from "zod";
import { ApiError, Errors } from "@/lib/api/errors";
import { buildPageMeta, paginationSchema, toSkipTake } from "@/lib/api/pagination";
import { generateOpaqueToken, sha256 } from "@/server/auth/tokens";
import { emailSchema } from "@/server/auth/validation";
import { requirePermission, type AuthContext } from "@/server/auth/guard";
import type { Deps } from "@/server/container";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { createHmac } from "node:crypto";
import { makeUnsubscribeToken, readUnsubscribeToken } from "./tokens";

/** Exact wording the person agreed to. Stored with each consent record. Change it => bump the version. */
export const CONSENT_TEXT_VERSION = "v1";
export const CONSENT_TEXT = "I agree to receive the E News newsletter by email and accept the privacy policy. I can unsubscribe at any time. (consent text v1)";
export const VERIFY_TTL_MS = 7 * 24 * 60 * 60_000;

export const subscribeSchema = z.object({
  email: emailSchema,
  consent: z.literal(true, { errorMap: () => ({ message: "Consent is required to subscribe" }) }),
});
export const tokenSchema = z.object({ token: z.string().min(20).max(300) });
export const listSubscribersQuery = paginationSchema.extend({ status: z.nativeEnum(SubscriberStatus).optional() });

const invalidToken = () => new ApiError(400, "INVALID_TOKEN", "This link is invalid or has expired");
const ipHash = (deps: Deps, ip: string) => createHmac("sha256", deps.env.JWT_REFRESH_SECRET).update("nl-ip:" + ip).digest("hex").slice(0, 32);

/**
 * Double opt-in. Nothing is ever sent to an address until its owner clicks the link in the confirmation mail.
 * Returns 409 for an already-active address (the spec asks for a visible "duplicate" message); that does reveal
 * whether an address is subscribed, so the endpoint is rate limited per address and per IP.
 */
export async function subscribe(deps: Deps, input: z.infer<typeof subscribeSchema>, meta: { ip: string }): Promise<{ status: "pending" }> {
  if (meta.ip !== "unknown") await enforceRateLimit(`nl:ip:${meta.ip}`, 10, 60 * 60_000);
  await enforceRateLimit(`nl:email:${input.email}`, 3, 60 * 60_000);
  const now = deps.now();
  const token = generateOpaqueToken();
  const consent = { consentAt: now, consentText: CONSENT_TEXT, consentIpHash: meta.ip === "unknown" ? null : ipHash(deps, meta.ip) };
  const pending = { status: SubscriberStatus.PENDING, verifyToken: token.hash, verifiedAt: null, unsubscribedAt: null, ...consent };

  const existing = await deps.db.newsletterSubscriber.findUnique({ where: { email: input.email }, select: { id: true, status: true } });
  if (existing?.status === SubscriberStatus.ACTIVE) throw Errors.conflict("This email is already subscribed.");
  try {
    if (existing) await deps.db.newsletterSubscriber.update({ where: { id: existing.id }, data: pending });
    else await deps.db.newsletterSubscriber.create({ data: { email: input.email, ...pending } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw Errors.conflict("This email is already subscribed or awaiting confirmation. Check your inbox.");
    throw e;
  }
  try {
    await deps.mailer.send({
      to: input.email,
      subject: "Confirm your E News subscription",
      text: `Please confirm that you want the E News newsletter:\n${deps.env.APP_URL}/newsletter/confirm?token=${token.token}\n\nThe link works for 7 days. If you did not ask for this, ignore this email and you will not be subscribed.`,
    });
  } catch (e) {
    console.error("[newsletter] confirmation email failed", e); // the address stays PENDING; the person can try again
    throw new ApiError(503, "INTERNAL_ERROR", "We could not send the confirmation email. Please try again later.");
  }
  return { status: "pending" };
}

/** Idempotent: confirming an already-active subscription succeeds again. */
export async function verifySubscription(deps: Deps, token: string): Promise<{ status: "active" }> {
  const hash = sha256(token);
  const sub = await deps.db.newsletterSubscriber.findUnique({ where: { verifyToken: hash } });
  if (!sub) throw invalidToken();
  if (sub.status === SubscriberStatus.ACTIVE) return { status: "active" };
  if (sub.status !== SubscriberStatus.PENDING || sub.consentAt.getTime() + VERIFY_TTL_MS <= deps.now().getTime()) throw invalidToken();
  const claimed = await deps.db.newsletterSubscriber.updateMany({ where: { id: sub.id, status: SubscriberStatus.PENDING, verifyToken: hash }, data: { status: SubscriberStatus.ACTIVE, verifiedAt: deps.now() } });
  if (claimed.count !== 1) {
    const now = await deps.db.newsletterSubscriber.findUnique({ where: { id: sub.id }, select: { status: true } });
    if (now?.status === SubscriberStatus.ACTIVE) return { status: "active" }; // lost a race with a double click
    throw invalidToken();
  }
  return { status: "active" };
}

/** Idempotent. The signed token is the proof of ownership, so a stranger cannot unsubscribe somebody by typing their address. */
export async function unsubscribe(deps: Deps, token: string): Promise<{ status: "unsubscribed" }> {
  const id = readUnsubscribeToken(deps, token);
  if (!id) throw invalidToken();
  const sub = await deps.db.newsletterSubscriber.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!sub) throw invalidToken();
  if (sub.status !== SubscriberStatus.UNSUBSCRIBED) {
    await deps.db.newsletterSubscriber.update({ where: { id }, data: { status: SubscriberStatus.UNSUBSCRIBED, unsubscribedAt: deps.now(), verifyToken: null } });
  }
  return { status: "unsubscribed" };
}

/** For campaign e-mails (not built yet): the footer link and the RFC 8058 List-Unsubscribe value. */
export const unsubscribeUrl = (deps: Deps, subscriberId: string): string => `${deps.env.APP_URL}/newsletter/unsubscribe?token=${makeUnsubscribeToken(deps, subscriberId)}`;

export interface SubscriberDto { id: string; email: string; status: SubscriberStatus; consentAt: string; verifiedAt: string | null; unsubscribedAt: string | null }

export async function listSubscribers(deps: Deps, ctx: Pick<AuthContext, "roles">, q: z.infer<typeof listSubscribersQuery>) {
  requirePermission(ctx, "newsletter:manage");
  const where: Prisma.NewsletterSubscriberWhereInput = q.status ? { status: q.status } : {};
  const [total, rows, grouped] = await Promise.all([
    deps.db.newsletterSubscriber.count({ where }),
    deps.db.newsletterSubscriber.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], ...toSkipTake(q) }),
    deps.db.newsletterSubscriber.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const counts: Record<SubscriberStatus, number> = { PENDING: 0, ACTIVE: 0, UNSUBSCRIBED: 0, BOUNCED: 0 };
  for (const g of grouped) counts[g.status] = g._count._all;
  const items: SubscriberDto[] = rows.map((r) => ({
    id: r.id, email: r.email, status: r.status, consentAt: r.consentAt.toISOString(),
    verifiedAt: r.verifiedAt?.toISOString() ?? null, unsubscribedAt: r.unsubscribedAt?.toISOString() ?? null,
  }));
  return { items, counts, meta: buildPageMeta(q, total) };
}
