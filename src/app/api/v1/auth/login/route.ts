import { ok, route } from "@/lib/api/response";
import { readJson } from "@/lib/api/request";
import { requestMeta, withSession } from "@/server/auth/http";
import { login } from "@/server/auth/service";
import { loginSchema } from "@/server/auth/validation";
import { getDeps } from "@/server/container";
import { assertSameOrigin } from "@/server/security/csrf";

export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const deps = getDeps();
  assertSameOrigin(req, deps.env.APP_URL);
  const session = await login(deps, await readJson(req, loginSchema), requestMeta(req));
  return withSession(ok({ user: session.user }), deps, session);
});
