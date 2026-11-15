import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { ok, route } from "@/lib/api/response";
import { queryParams } from "@/lib/api/request";
import { getContent } from "@/lib/content";
import { parseSearchParams, parseSort } from "@/lib/search";
import { clientIp, enforceRateLimit } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";

const sizeSchema = z.coerce.number().int().min(1).max(20).default(10);

/** GET /api/v1/search?q=&page=&pageSize=&sort=relevance|latest. Public; bounded query length, page depth and rate. */
export const GET = route(async (req) => {
  const ip = clientIp(req);
  if (ip !== "unknown") await enforceRateLimit(`search:ip:${ip}`, 60, 60_000);
  const raw = queryParams(req);
  const parsed = parseSearchParams(raw);
  if (!parsed.ok) {
    const message = parsed.reason === "too_short" ? "Search text is too short" : "Search text is required";
    throw new ApiError(422, "VALIDATION_ERROR", message, [{ path: "q", message }]);
  }
  const pageSize = sizeSchema.parse(raw.pageSize);
  const { items, meta } = await getContent().search({ q: parsed.q, page: parsed.page, pageSize, sort: parseSort(raw.sort) });
  return ok(items, meta, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } });
});
