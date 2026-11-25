import type { MetadataRoute } from "next";
import { getContent } from "@/lib/content";
import { absoluteUrl } from "@/lib/seo";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const repo = getContent();
  const [cats, articles] = await Promise.all([
    repo.listCategories().catch(() => []),
    repo.listSitemapEntries(5000).catch(() => []),
  ]);

  const coreRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/", base), changeFrequency: "hourly", priority: 1.0 },
    { url: absoluteUrl("/news", base), changeFrequency: "hourly", priority: 0.9 },
    { url: absoluteUrl("/trending", base), changeFrequency: "hourly", priority: 0.85 },
    { url: absoluteUrl("/most-read", base), changeFrequency: "hourly", priority: 0.85 },
    { url: absoluteUrl("/subscribe", base), changeFrequency: "daily", priority: 0.85 },
    { url: absoluteUrl("/about", base), changeFrequency: "monthly", priority: 0.6 },
    { url: absoluteUrl("/contact", base), changeFrequency: "monthly", priority: 0.6 },
    { url: absoluteUrl("/newsletter", base), changeFrequency: "weekly", priority: 0.7 },
    { url: absoluteUrl("/privacy-policy", base), changeFrequency: "monthly", priority: 0.5 },
    { url: absoluteUrl("/terms", base), changeFrequency: "monthly", priority: 0.5 },
  ];

  const categoryRoutes: MetadataRoute.Sitemap = cats.map((c) => ({
    url: absoluteUrl(`/category/${c.slug}`, base),
    changeFrequency: "hourly",
    priority: 0.8,
  }));

  const articleRoutes: MetadataRoute.Sitemap = articles.map((a) => ({
    url: absoluteUrl(`/news/${a.slug}`, base),
    lastModified: a.updatedAt,
    changeFrequency: "daily",
    priority: 0.75,
  }));

  return [...coreRoutes, ...categoryRoutes, ...articleRoutes];
}
