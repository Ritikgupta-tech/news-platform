import { created, route } from "@/lib/api/response";
import { readJson } from "@/lib/api/request";
import { requestMeta } from "@/server/auth/http";
import { getDeps } from "@/server/container";
import { subscribe, subscribeSchema } from "@/server/newsletter/service";
import { assertSameOrigin } from "@/server/security/csrf";

export const dynamic = "force-dynamic";

/** Starts double opt-in: stores the consent record and e-mails a confirmation link. 409 if already subscribed. */
export const POST = route(async (req) => {
  const deps = getDeps();
  assertSameOrigin(req, deps.env.APP_URL);
  const input = await readJson(req, subscribeSchema, 2048);
  return created(await subscribe(deps, input, { ip: requestMeta(req).ip }));
});
