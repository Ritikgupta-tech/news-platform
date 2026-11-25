import type { ArticleDetail } from "@/lib/content/types";

export function absoluteUrl(path: string, base: string): string {
  return new URL(path, base.endsWith("/") ? base : `${base}/`).toString();
}

/** schema.org NewsArticle. Serialise with jsonLdString() so "</script>" in content cannot break out. */
export function newsArticleJsonLd(a: ArticleDetail, base: string, publisherName = "The Independent Journal") {
  const url = absoluteUrl(`/news/${a.slug}`, base);
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    headline: a.title.slice(0, 110),
    description: a.summary,
    image: a.image ? [a.image.url.startsWith("http") ? a.image.url : absoluteUrl(a.image.url, base)] : undefined,
    datePublished: a.publishedAt,
    dateModified: a.updatedAt,
    articleSection: a.category.name,
    author: [{ "@type": "Person", name: a.author.name, url: a.author.slug ? absoluteUrl(`/authors/${a.author.slug}`, base) : undefined }],
    publisher: {
      "@type": "NewsMediaOrganization",
      name: publisherName,
      url: base,
      logo: {
        "@type": "ImageObject",
        url: absoluteUrl("/logo.png", base),
      },
      publishingPrinciples: absoluteUrl("/about", base),
    },
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[], base: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absoluteUrl(it.path, base) })),
  };
}

export function websiteJsonLd(base: string, name = "The Independent Journal") {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    url: base,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${base}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function newsOrganizationJsonLd(base: string, name = "The Independent Journal") {
  return {
    "@context": "https://schema.org",
    "@type": "NewsMediaOrganization",
    name,
    url: base,
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl("/logo.png", base),
    },
    publishingPrinciples: absoluteUrl("/about", base),
    correctionsPolicy: absoluteUrl("/about", base),
    ethicsPolicy: absoluteUrl("/terms", base),
  };
}

export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
