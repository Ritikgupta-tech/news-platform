import { z } from "zod";
import { ok, route } from "@/lib/api/response";
import { queryParams } from "@/lib/api/request";
import { getContent } from "@/lib/content";

export const dynamic = "force-dynamic";

const query = z.object({ limit: z.coerce.number().int().min(1).max(20).default(10) });

/**
 * GET /api/v1/analytics/trending?limit=10
 * Public. Same ranking as the /trending page (src/lib/trending.ts); contains only published stories and no private data,
 * so it may be cached publicly for a short time.
 */
export const GET = route(async (req) => {
  const { limit } = query.parse(queryParams(req));
  const items = await getContent().listTrending(limit);
  return ok(items, { limit }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=120" } });
});
