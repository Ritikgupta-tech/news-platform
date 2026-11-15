import { created, route } from "@/lib/api/response";
import { readJson } from "@/lib/api/request";
import { requestMeta, withSession } from "@/server/auth/http";
import { register } from "@/server/auth/service";
import { registerSchema } from "@/server/auth/validation";
import { getDeps } from "@/server/container";
import { assertSameOrigin } from "@/server/security/csrf";

export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const deps = getDeps();
  assertSameOrigin(req, deps.env.APP_URL);
  const session = await register(deps, await readJson(req, registerSchema), requestMeta(req));
  return withSession(created({ user: session.user }), deps, session);
});
