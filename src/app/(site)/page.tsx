import { ButtonLink } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { StateMessage } from "@/components/ui/StateMessage";
import { HeroCarousel } from "@/components/news/HeroCarousel";
import { FeaturedStories } from "@/components/news/FeaturedStories";
import { RankedList } from "@/components/news/RankedList";
import { CategoryShortcuts } from "@/components/news/CategoryShortcuts";
import { InteractiveFeed } from "@/components/news/InteractiveFeed";
import { NewsletterCard } from "@/components/news/NewsletterCard";
import { PromoBanner } from "@/components/news/PromoBanner";
import { CATEGORY_SHORTCUTS } from "@/config/navigation";
import { getContent } from "@/lib/content";
import { settle } from "@/lib/safe";
import { siteUrl } from "@/lib/site";
import { websiteJsonLd, newsOrganizationJsonLd, jsonLdString } from "@/lib/seo";

export default async function Home() {
  const base = siteUrl();
  const c = getContent();
  const [hero, featured, viewed, trending, latest, promo] = await Promise.all([
    settle("hero", c.listHero(5), []),
    settle("featured", c.listFeatured(3), []),
    settle("mostViewed", c.listMostViewed(5), []),
    settle("trending", c.listTrending(5), []),
    settle("latest", c.listLatest({ page: 1, pageSize: 12 }), null),
    settle("promo", c.getPromo(), null),
  ]);
  const allFailed = [hero, featured, viewed, trending, latest].every((r) => r.failed);
  const nothingPublished = !allFailed && hero.data.length === 0 && (latest.data?.items.length ?? 0) === 0;

  if (allFailed) return <StateMessage as="h1" kind="error" title="We couldn’t load the news right now">Please refresh in a moment.</StateMessage>;
  if (nothingPublished) return <StateMessage as="h1" kind="empty" title="No stories published yet">Check back soon for the latest reporting.</StateMessage>;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(websiteJsonLd(base)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(newsOrganizationJsonLd(base)) }} />
      {hero.data.length === 0 ? <h1 className="visually-hidden">E News: Lead Editorial Stories</h1> : null}

      {/* Hero Showcase & Curated Dispatch Grid */}
      <div className="home-hero-grid">
        <div className="home-hero-col">
          {hero.data.length ? <HeroCarousel articles={hero.data} autoPlayMs={6500} /> : null}
        </div>
        <aside className="home-sidebar-col" aria-label="Curator's selection and most read">
          {featured.data.length ? (
            <section className="panel panel--editorial">
              <SectionHeading title="Editor's Selection" href="/news" />
              <FeaturedStories items={featured.data} />
            </section>
          ) : null}
          {viewed.data.length ? (
            <section className="panel panel--editorial">
              <SectionHeading title="The Most Read" href="/most-read" />
              <RankedList items={viewed.data} label="Most read dispatches" />
            </section>
          ) : null}
        </aside>
      </div>

      {/* Curated Desks & Categories */}
      <section aria-labelledby="editorial-desks" className="desks-section">
        <h2 id="editorial-desks" className="visually-hidden">Editorial Desks</h2>
        <CategoryShortcuts items={CATEGORY_SHORTCUTS} />
      </section>

      {/* Primary Editorial Feed & Trending Velocity */}
      <div className="home-content-grid">
        <section aria-labelledby="latest-dispatches" className="latest-feed-section">
          <div className="section-heading section-heading--luxury">
            <div>
              <span className="eyebrow-tag">LIVE FEED</span>
              <h2 id="latest-dispatches">Global Dispatches</h2>
            </div>
            <span className="section-rule" aria-hidden="true" />
          </div>

          {latest.failed ? (
            <StateMessage kind="error" title="Latest news is unavailable">Please try again shortly.</StateMessage>
          ) : (
            <>
              <InteractiveFeed initialArticles={latest.data?.items ?? []} />
              {latest.data?.meta.hasNext ? (
                <div className="feed-actions">
                  <ButtonLink href="/news?page=2" variant="secondary" className="btn--luxury-loadmore">
                    <span>Explore More Dispatches</span>
                  </ButtonLink>
                </div>
              ) : null}
            </>
          )}
        </section>

        <aside className="trending-sidebar" aria-labelledby="trending-index">
          <section className="panel panel--sticky" aria-labelledby="trending-index">
            <div className="section-heading section-heading--compact">
              <div className="section-heading__with-badge">
                <span className="live-dot" aria-hidden="true" />
                <h2 id="trending-index">Velocity Index</h2>
              </div>
            </div>
            {trending.data.length ? (
              <RankedList items={trending.data} label="Trending dispatches" showThumb={false} />
            ) : (
              <p className="muted">Trending stories will appear here once readers start engaging.</p>
            )}
          </section>
        </aside>
      </div>

      {/* Executive Briefing Newsletter */}
      <NewsletterCard />

      {/* Editorial Promo Banner if active */}
      {promo.data ? <PromoBanner promo={promo.data} /> : null}
    </>
  );
}
