import { getContent } from "@/lib/content";
import { buildRss } from "@/lib/rss";
import { SITE_NAME, siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/** RSS 2.0 of the 30 newest live articles (summaries only, with links back to the site). */
export async function GET() {
  const { items } = await getContent().listLatest({ page: 1, pageSize: 30 });
  const xml = buildRss(items, { base: siteUrl(), title: `${SITE_NAME} - latest news`, description: "The latest stories from E News.", now: new Date() });
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
