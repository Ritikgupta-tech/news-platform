import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { HeroCarousel } from "@/components/news/HeroCarousel";
import { FeaturedStories } from "@/components/news/FeaturedStories";
import { RankedList } from "@/components/news/RankedList";
import { CategoryShortcuts } from "@/components/news/CategoryShortcuts";
import { ArticleRow, ArticleCard } from "@/components/news/ArticleCard";
import { NewsletterCard } from "@/components/news/NewsletterCard";
import { PromoBanner } from "@/components/news/PromoBanner";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { StateMessage } from "@/components/ui/StateMessage";
import { Skeleton } from "@/components/ui/Skeleton";
import { ButtonLink } from "@/components/ui/Button";
import { CATEGORY_SHORTCUTS } from "@/config/navigation";
import { PREVIEW_FEATURED, PREVIEW_HERO, PREVIEW_LATEST, PREVIEW_NOTIFICATIONS, PREVIEW_NOW, PREVIEW_RANKED, PREVIEW_USER } from "@/dev/fixtures";

export const metadata: Metadata = { title: "Design system preview", robots: { index: false, follow: false } };

/** Dev-only component gallery. Returns 404 in production builds. */
export default function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <>
      <div className="dev-banner">Design preview. Content below is placeholder data for component testing, not news.</div>
      <SiteHeader user={PREVIEW_USER} notifications={PREVIEW_NOTIFICATIONS} />
      <main id="main" className="container page">
        <div className="home-grid">
          <HeroCarousel articles={PREVIEW_HERO} />
          <aside className="stack" aria-label="Sidebar">
            <section className="panel">
              <SectionHeading title="Featured Stories" href="/news" />
              <FeaturedStories items={PREVIEW_FEATURED} now={PREVIEW_NOW} />
            </section>
            <section className="panel">
              <SectionHeading title="Most Viewed" href="/most-read" />
              <RankedList items={PREVIEW_RANKED} label="Most viewed articles" />
            </section>
          </aside>
        </div>

        <section aria-labelledby="cats"><h2 id="cats" className="visually-hidden">Categories</h2><CategoryShortcuts items={CATEGORY_SHORTCUTS} /></section>

        <div className="home-grid">
          <section aria-labelledby="latest">
            <div className="section-heading"><h2 id="latest">Latest News</h2></div>
            <div className="feed">{PREVIEW_LATEST.map((a) => <ArticleRow key={a.id} article={a} now={PREVIEW_NOW} />)}</div>
            <div style={{ marginTop: "var(--sp-5)" }}><ButtonLink href="/news" variant="secondary">Load more</ButtonLink></div>
          </section>
          <section className="panel" aria-labelledby="trend">
            <div className="section-heading"><h2 id="trend">Trending Now</h2></div>
            <RankedList items={PREVIEW_RANKED.slice(0, 4)} label="Trending articles" showThumb={false} />
          </section>
        </div>

        <NewsletterCard />
        <PromoBanner promo={{ eyebrow: "Sample promotion", title: "Promotional banner content is managed from the CMS", body: "Placeholder copy.", ctaLabel: "Learn more", ctaHref: "/about" }} />

        <section aria-labelledby="states">
          <div className="section-heading"><h2 id="states">Component states</h2></div>
          <div className="card-grid card-grid--3">
            <ArticleCard article={PREVIEW_LATEST[0]!} now={PREVIEW_NOW} />
            <div aria-busy="true" className="stack"><Skeleton style={{ height: 160 }} /><Skeleton style={{ height: 18, width: "70%" }} /><Skeleton style={{ height: 14, width: "40%" }} /></div>
            <div className="stack">
              <StateMessage kind="empty" title="No articles yet">Nothing has been published in this category.</StateMessage>
              <StateMessage kind="error" title="Something went wrong">We couldn&rsquo;t load this section. Try again.</StateMessage>
              <StateMessage kind="unauthorized" title="Sign in required">You need an account with the right role to view this page.</StateMessage>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter contactEmail="newsroom@example.test" />
    </>
  );
}
