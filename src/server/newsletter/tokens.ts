import { createHmac, timingSafeEqual } from "node:crypto";
import type { Deps } from "@/server/container";

/**
 * Unsubscribe links are stateless: `<subscriberId>.<hmac>`. They never expire (a person must always be able to
 * leave) and cannot be forged or guessed for another subscriber without the server secret.
 */
const mac = (deps: Deps, id: string) => createHmac("sha256", deps.env.JWT_REFRESH_SECRET).update("newsletter-unsub:" + id).digest("base64url");

export const makeUnsubscribeToken = (deps: Deps, subscriberId: string): string => `${subscriberId}.${mac(deps, subscriberId)}`;

export function readUnsubscribeToken(deps: Deps, token: string): string | null {
  const i = token.indexOf(".");
  if (i < 1) return null;
  const id = token.slice(0, i);
  const given = Buffer.from(token.slice(i + 1));
  const expected = Buffer.from(mac(deps, id));
  if (!/^[0-9a-f-]{36}$/i.test(id) || given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return id;
}
