import { ok, route } from "@/lib/api/response";
import { readJson } from "@/lib/api/request";
import { parseCookies } from "@/server/auth/cookies";
import { optionalAuth } from "@/server/auth/guard";
import { requestMeta } from "@/server/auth/http";
import { recordView, viewSchema, VIEW_COOKIE, VIEW_COOKIE_MAX_AGE, VIEW_COOKIE_PATH } from "@/server/analytics/views";
import { getDeps } from "@/server/container";
import { assertSameOrigin } from "@/server/security/csrf";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/analytics/views  { articleId }
 * Public (signed-in or not). Idempotent per viewer per article per UTC day. Always answers 200 with
 * { counted } so tracking never produces visible errors for readers.
 */
export const POST = route(async (req) => {
  const deps = getDeps();
  assertSameOrigin(req, deps.env.APP_URL);
  const { articleId } = await readJson(req, viewSchema, 1024);
  const auth = await optionalAuth(deps, req);
  const meta = requestMeta(req);
  const result = await recordView(deps, {
    articleId,
    userId: auth?.id ?? null,
    anonId: parseCookies(req.headers.get("cookie"))[VIEW_COOKIE],
    userAgent: meta.userAgent,
    ip: meta.ip,
    optedOut: req.headers.get("sec-gpc") === "1" || req.headers.get("dnt") === "1",
  });
  const res = ok({ counted: result.counted }, undefined, { headers: { "Cache-Control": "private, no-store" } });
  if (result.newAnonId) {
    const secure = deps.env.APP_URL.startsWith("https://") ? "; Secure" : "";
    res.headers.append("Set-Cookie", `${VIEW_COOKIE}=${encodeURIComponent(result.newAnonId)}; Path=${VIEW_COOKIE_PATH}; Max-Age=${VIEW_COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax${secure}`);
  }
  return res;
});
