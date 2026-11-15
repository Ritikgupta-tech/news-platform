import { NextResponse } from "next/server";
import { clientIp } from "@/server/security/rate-limit";
import { clearSessionCookies, sessionCookies } from "./cookies";
import type { RequestMeta } from "./service";
import type { Deps } from "@/server/container";

export const requestMeta = (req: Request): RequestMeta => ({ ip: clientIp(req), userAgent: req.headers.get("user-agent") });

const isSecure = (deps: Deps) => deps.env.APP_URL.startsWith("https://");

export function withSession<T extends Response>(res: T, deps: Deps, tokens: { accessToken: string; refreshToken: string }): T {
  for (const c of sessionCookies(tokens.accessToken, tokens.refreshToken, isSecure(deps))) res.headers.append("Set-Cookie", c);
  return res;
}

export function withClearedSession<T extends Response>(res: T, deps: Deps): T {
  for (const c of clearSessionCookies(isSecure(deps))) res.headers.append("Set-Cookie", c);
  return res;
}

/** Only same-site relative paths may be used as redirect targets (prevents open redirects). */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\u0000-\u001f]/.test(next)) return "/";
  return next;
}

export const redirectTo = (req: Request, path: string) => NextResponse.redirect(new URL(path, req.url), 303);
