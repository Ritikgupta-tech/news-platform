import { ApiError } from "@/lib/api/errors";
import { ok, route, toErrorResponse } from "@/lib/api/response";
import { REFRESH_COOKIE, parseCookies } from "@/server/auth/cookies";
import { withClearedSession, withSession } from "@/server/auth/http";
import { refresh } from "@/server/auth/service";
import { getDeps } from "@/server/container";
import { assertSameOrigin } from "@/server/security/csrf";

export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const deps = getDeps();
  assertSameOrigin(req, deps.env.APP_URL);
  const token = parseCookies(req.headers.get("cookie"))[REFRESH_COOKIE];
  try {
    if (!token) throw new ApiError(401, "UNAUTHENTICATED", "No session");
    const session = await refresh(deps, token);
    return withSession(ok({ user: session.user }), deps, session);
  } catch (e) {
    if (e instanceof ApiError && e.code === "UNAUTHENTICATED") return withClearedSession(toErrorResponse(e, crypto.randomUUID()), deps);
    throw e;
  }
});
