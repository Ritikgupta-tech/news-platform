import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { isAutomatedUserAgent } from "@/lib/bots";
import { liveWhere } from "@/server/articles/service";
import type { Deps } from "@/server/container";
import { enforceRateLimit } from "@/server/security/rate-limit";

export const VIEW_COOKIE = "enews_vid";
export const VIEW_COOKIE_PATH = "/api/v1/analytics";
export const VIEW_COOKIE_MAX_AGE = 180 * 24 * 60 * 60;
export const viewSchema = z.object({ articleId: z.string().uuid() });

export interface ViewInput {
  articleId: string;
  userId: string | null;
  /** Anonymous browser id from the enews_vid cookie, if the browser already has one. */
  anonId: string | undefined;
  userAgent: string | null;
  ip: string;
  /** Global Privacy Control / Do Not Track signal. */
  optedOut: boolean;
}

export interface ViewResult {
  counted: boolean;
  reason?: "bot" | "opted_out" | "not_live" | "duplicate";
  /** Set when a new anonymous id was minted and the route must send it as a cookie. */
  newAnonId?: string;
}

/** Keyed hash: the stored viewerKey cannot be reversed to a user id or cookie value, and cannot be linked across secrets. */
export const viewerKeyFor = (deps: Deps, who: { userId: string } | { anonId: string }): string =>
  createHmac("sha256", deps.env.JWT_REFRESH_SECRET).update("view:" + ("userId" in who ? `u:${who.userId}` : `a:${who.anonId}`)).digest("hex").slice(0, 32);

const ANON_ID_RE = /^[A-Za-z0-9_-]{22,64}$/;
export const newAnonId = (): string => randomBytes(18).toString("base64url");

/** UTC calendar day, the unit of "unique per day". */
export const utcDay = (d: Date): Date => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/**
 * Records at most one view per (article, viewer, UTC day). Refreshes, repeated tracking events and parallel
 * tabs hit the unique index and are ignored. Crawlers and opted-out browsers are not counted and get no cookie.
 */
export async function recordView(deps: Deps, input: ViewInput): Promise<ViewResult> {
  if (input.optedOut) return { counted: false, reason: "opted_out" };
  if (isAutomatedUserAgent(input.userAgent)) return { counted: false, reason: "bot" };
  // Per-IP cap only when the IP is known (TRUST_PROXY=1); otherwise every visitor would share one bucket.
  if (input.ip !== "unknown") await enforceRateLimit(`view:ip:${input.ip}`, 120, 60 * 60_000);

  let anonId = input.anonId && ANON_ID_RE.test(input.anonId) ? input.anonId : undefined;
  let newId: string | undefined;
  if (!input.userId && !anonId) anonId = newId = newAnonId();
  const viewerKey = viewerKeyFor(deps, input.userId ? { userId: input.userId } : { anonId: anonId! });
  await enforceRateLimit(`view:key:${viewerKey}`, 200, 60 * 60_000);

  const now = deps.now();
  const article = await deps.db.article.findFirst({ where: { id: input.articleId, ...liveWhere(now) }, select: { id: true } });
  if (!article) return { counted: false, reason: "not_live", newAnonId: newId };

  const res = await deps.db.articleView.createMany({ data: [{ articleId: article.id, viewerKey, viewDate: utcDay(now) }], skipDuplicates: true });
  return res.count === 1 ? { counted: true, newAnonId: newId } : { counted: false, reason: "duplicate", newAnonId: newId };
}
