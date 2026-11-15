import { ok, route } from "@/lib/api/response";
import { readJson } from "@/lib/api/request";
import { getDeps } from "@/server/container";
import { tokenSchema, verifySubscription } from "@/server/newsletter/service";
import { assertSameOrigin } from "@/server/security/csrf";

export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const deps = getDeps();
  assertSameOrigin(req, deps.env.APP_URL);
  const { token } = await readJson(req, tokenSchema, 2048);
  return ok(await verifySubscription(deps, token));
});
