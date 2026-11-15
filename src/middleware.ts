import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, SESSION_HINT_COOKIE } from "@/server/auth/cookies";
import { verifyAccessToken } from "@/server/auth/jwt";

/**
 * Silent session refresh for page navigations (edge-safe: no database access).
 * Access cookie expired + session hint present => send the browser through the refresh route once.
 * (The refresh token itself is only sent to /api/v1/auth, which is where that route lives.)
 */
export async function middleware(req: NextRequest) {
  if (req.headers.get("next-router-prefetch") || req.headers.get("purpose") === "prefetch") return NextResponse.next();
  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  const hint = req.cookies.get(SESSION_HINT_COOKIE)?.value;
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!hint || !secret) return NextResponse.next();
  if (access && (await verifyAccessToken(access, secret))) return NextResponse.next();
  const url = new URL("/api/v1/auth/session-refresh", req.url);
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api/|media/|_next/|favicon.ico|robots.txt|sitemap.xml).*)"],
};
