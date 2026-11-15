import { noContent, route } from "@/lib/api/response";
import { readJson } from "@/lib/api/request";
import { deleteAccount, deleteAccountSchema } from "@/server/account/service";
import { requireAuth } from "@/server/auth/guard";
import { withClearedSession } from "@/server/auth/http";
import { getDeps } from "@/server/container";

export const dynamic = "force-dynamic";

/** Irreversible. Requires the current password and the word DELETE. */
export const POST = route(async (req) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  await deleteAccount(deps, ctx, await readJson(req, deleteAccountSchema));
  return withClearedSession(noContent(), deps);
});
