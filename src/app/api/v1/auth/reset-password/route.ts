import { ok, route } from "@/lib/api/response";
import { readJson } from "@/lib/api/request";
import { withClearedSession } from "@/server/auth/http";
import { resetPassword } from "@/server/auth/service";
import { resetPasswordSchema } from "@/server/auth/validation";
import { getDeps } from "@/server/container";
import { assertSameOrigin } from "@/server/security/csrf";

export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const deps = getDeps();
  assertSameOrigin(req, deps.env.APP_URL);
  await resetPassword(deps, await readJson(req, resetPasswordSchema));
  return withClearedSession(ok({ message: "Password updated. Please sign in." }), deps);
});
