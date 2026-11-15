import { noContent, route } from "@/lib/api/response";
import { ACCESS_COOKIE, REFRESH_COOKIE, parseCookies } from "@/server/auth/cookies";
import { authenticateToken } from "@/server/auth/guard";
import { redirectTo, withClearedSession } from "@/server/auth/http";
import { logout } from "@/server/auth/service";
import { getDeps } from "@/server/container";
import { assertSameOrigin } from "@/server/security/csrf";

export const dynamic = "force-dynamic";

/** Idempotent: always clears cookies, and revokes the server-side session if one can be identified. */
export const POST = route(async (req) => {
  const deps = getDeps();
  assertSameOrigin(req, deps.env.APP_URL);
  const cookies = parseCookies(req.headers.get("cookie"));
  const ctx = await authenticateToken(deps, cookies[ACCESS_COOKIE]);
  await logout(deps, { sessionId: ctx?.sessionId, refreshToken: cookies[REFRESH_COOKIE] });
  // A plain HTML form post (header menu) wants a page, API clients want 204.
  const wantsPage = (req.headers.get("accept") ?? "").includes("text/html");
  return withClearedSession(wantsPage ? redirectTo(req, "/") : noContent(), deps);
});
