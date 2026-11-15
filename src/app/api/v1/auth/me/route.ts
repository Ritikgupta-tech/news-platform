import { ok, route } from "@/lib/api/response";
import { requireAuth } from "@/server/auth/guard";
import { getDeps } from "@/server/container";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const { sessionId: _sessionId, ...user } = await requireAuth(getDeps(), req);
  return ok({ user }, undefined, { headers: { "Cache-Control": "private, no-store" } });
});
