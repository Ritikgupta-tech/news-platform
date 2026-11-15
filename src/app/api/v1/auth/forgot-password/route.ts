import { ok, route } from "@/lib/api/response";
import { readJson } from "@/lib/api/request";
import { requestMeta } from "@/server/auth/http";
import { forgotPassword } from "@/server/auth/service";
import { forgotPasswordSchema } from "@/server/auth/validation";
import { getDeps } from "@/server/container";
import { assertSameOrigin } from "@/server/security/csrf";

export const dynamic = "force-dynamic";

/** Same 202 response whether or not the account exists. */
export const POST = route(async (req) => {
  const deps = getDeps();
  assertSameOrigin(req, deps.env.APP_URL);
  const { email } = await readJson(req, forgotPasswordSchema);
  await forgotPassword(deps, email, requestMeta(req));
  return ok({ message: "If an account exists for that email, a reset link has been sent." }, undefined, { status: 202 });
});
