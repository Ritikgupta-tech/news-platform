import type { MetadataRoute } from "next";
import { getContent } from "@/lib/content";
import { absoluteUrl } from "@/lib/seo";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const repo = getContent();
  const [cats, articles] = await Promise.all([repo.listCategories().catch(() => []), repo.listSitemapEntries(5000).catch(() => [])]);
  const fixed = ["/", "/news", "/trending", "/most-read", "/subscribe", "/about", "/contact", "/newsletter", "/privacy-policy", "/terms"].map((p) => ({ url: absoluteUrl(p, base) }));
  return [
    ...fixed,
    ...cats.map((c) => ({ url: absoluteUrl(`/category/${c.slug}`, base) })),
    ...articles.map((a) => ({ url: absoluteUrl(`/news/${a.slug}`, base), lastModified: a.updatedAt })),
  ];
}
