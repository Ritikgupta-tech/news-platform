import { REFRESH_COOKIE, parseCookies } from "@/server/auth/cookies";
import { redirectTo, safeNextPath, withClearedSession, withSession } from "@/server/auth/http";
import { refresh } from "@/server/auth/service";
import { getDeps } from "@/server/container";

export const dynamic = "force-dynamic";

/**
 * Silent refresh for page navigations. The edge middleware sends users here when their access cookie
 * expired but a refresh cookie exists. On success cookies are rotated and the user lands where they were going;
 * on failure the cookies are cleared (so there is no redirect loop) and they continue as an anonymous visitor.
 */
export async function GET(req: Request) {
  const deps = getDeps();
  const target = safeNextPath(new URL(req.url).searchParams.get("next"));
  const token = parseCookies(req.headers.get("cookie"))[REFRESH_COOKIE];
  if (!token) return withClearedSession(redirectTo(req, target), deps);
  try {
    const session = await refresh(deps, token);
    return withSession(redirectTo(req, target), deps, session);
  } catch {
    return withClearedSession(redirectTo(req, target), deps);
  }
}
