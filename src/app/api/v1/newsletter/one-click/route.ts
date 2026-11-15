import { ok, route } from "@/lib/api/response";
import { getDeps } from "@/server/container";
import { unsubscribe } from "@/server/newsletter/service";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { requestMeta } from "@/server/auth/http";

export const dynamic = "force-dynamic";

/**
 * RFC 8058 one-click unsubscribe. Mail clients POST here (body `List-Unsubscribe=One-Click`) when someone presses their
 * own "Unsubscribe" button. The signed token in the URL is the proof of ownership, so no cookie or Origin check applies.
 * GET is deliberately not supported: link scanners must not be able to unsubscribe people.
 */
export const POST = route(async (req) => {
  const deps = getDeps();
  const ip = requestMeta(req).ip;
  if (ip !== "unknown") await enforceRateLimit(`nl:oneclick:${ip}`, 60, 60 * 60_000);
  const token = new URL(req.url).searchParams.get("token") ?? "";
  return ok(await unsubscribe(deps, token));
});
