import { ButtonLink } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { StateMessage } from "@/components/ui/StateMessage";
import { HeroCarousel } from "@/components/news/HeroCarousel";
import { FeaturedStories } from "@/components/news/FeaturedStories";
import { RankedList } from "@/components/news/RankedList";
import { CategoryShortcuts } from "@/components/news/CategoryShortcuts";
import { ArticleRow } from "@/components/news/ArticleCard";
import { NewsletterCard } from "@/components/news/NewsletterCard";
import { PromoBanner } from "@/components/news/PromoBanner";
import { CATEGORY_SHORTCUTS } from "@/config/navigation";
import { getContent } from "@/lib/content";
import { settle } from "@/lib/safe";

export default async function Home() {
  const c = getContent();
  const [hero, featured, viewed, trending, latest, promo] = await Promise.all([
    settle("hero", c.listHero(5), []),
    settle("featured", c.listFeatured(3), []),
    settle("mostViewed", c.listMostViewed(5), []),
    settle("trending", c.listTrending(5), []),
    settle("latest", c.listLatest({ page: 1, pageSize: 6 }), null),
    settle("promo", c.getPromo(), null),
  ]);
  const allFailed = [hero, featured, viewed, trending, latest].every((r) => r.failed);
  const nothingPublished = !allFailed && hero.data.length === 0 && (latest.data?.items.length ?? 0) === 0;

  if (allFailed) return <StateMessage as="h1" kind="error" title="We couldn’t load the news right now">Please refresh in a moment.</StateMessage>;
  if (nothingPublished) return <StateMessage as="h1" kind="empty" title="No stories published yet">Check back soon for the latest reporting.</StateMessage>;

  return (
    <>
      {hero.data.length === 0 ? <h1 className="visually-hidden">E News: top stories</h1> : null}
      <div className="home-grid">
        <div>{hero.data.length ? <HeroCarousel articles={hero.data} /> : null}</div>
        <aside className="stack" aria-label="Featured and most viewed">
          {featured.data.length ? (<section className="panel"><SectionHeading title="Featured Stories" href="/news" /><FeaturedStories items={featured.data} /></section>) : null}
          {viewed.data.length ? (<section className="panel"><SectionHeading title="Most Viewed" href="/most-read" /><RankedList items={viewed.data} label="Most viewed articles" /></section>) : null}
        </aside>
      </div>

      <section aria-labelledby="cats"><h2 id="cats" className="visually-hidden">Categories</h2><CategoryShortcuts items={CATEGORY_SHORTCUTS} /></section>

      <div className="home-grid">
        <section aria-labelledby="latest">
          <div className="section-heading"><h2 id="latest">Latest News</h2></div>
          {latest.failed ? <StateMessage kind="error" title="Latest news is unavailable">Please try again shortly.</StateMessage> : (
            <>
              <div className="feed">{latest.data?.items.map((a) => <ArticleRow key={a.id} article={a} />)}</div>
              {latest.data?.meta.hasNext ? <div style={{ marginTop: "var(--sp-5)" }}><ButtonLink href="/news?page=2" variant="secondary">More news</ButtonLink></div> : null}
            </>
          )}
        </section>
        <section className="panel" aria-labelledby="trend">
          <div className="section-heading"><h2 id="trend">Trending Now</h2></div>
          {trending.data.length ? <RankedList items={trending.data} label="Trending articles" showThumb={false} /> : <p className="muted">Trending stories will appear here once readers start engaging.</p>}
        </section>
      </div>

      <NewsletterCard />
      {promo.data ? <PromoBanner promo={promo.data} /> : null}
    </>
  );
}
