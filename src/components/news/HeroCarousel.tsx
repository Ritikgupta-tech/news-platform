"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ArticleImage } from "./ArticleImage";
import { formatDate } from "@/lib/format";
import type { ArticleSummary } from "@/types/news";

interface Props {
  articles: ArticleSummary[];
  /** Auto-advance interval in ms. 0 disables. Always disabled under prefers-reduced-motion. */
  autoPlayMs?: number;
}

export function HeroCarousel({ articles, autoPlayMs = 0 }: Props) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(true);
  const touchX = useRef<number | null>(null);
  const count = articles.length;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const go = useCallback((n: number) => setIndex(((n % count) + count) % count), [count]);

  useEffect(() => {
    if (!autoPlayMs || reduced || paused || count < 2) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % count), autoPlayMs);
    return () => window.clearInterval(t);
  }, [autoPlayMs, reduced, paused, count]);

  if (count === 0) return null;
  const a = articles[Math.min(index, count - 1)]!;

  return (
    <section
      className="hero"
      aria-roledescription="carousel"
      aria-label="Top stories"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        const end = e.changedTouches[0]?.clientX;
        touchX.current = null;
        if (start === null || end === undefined || Math.abs(end - start) < 48) return;
        go(index + (end < start ? 1 : -1));
      }}
    >
      <div className="hero__slide" key={a.id} role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${count}`}>
        <div className="hero__text">
          <div className="hero__badges">
            {a.isBreaking ? <Badge tone="breaking">Breaking News</Badge> : null}
            <Badge>{a.category.name}</Badge>
          </div>
          <h1 className="hero__title"><Link href={`/news/${a.slug}`}>{a.title}</Link></h1>
          <p className="hero__summary">{a.summary}</p>
          <p className="meta">
            <span>{a.author.name}</span><span aria-hidden="true">·</span>
            <time dateTime={a.publishedAt}>{formatDate(a.publishedAt)}</time><span aria-hidden="true">·</span>
            <span className="meta__read"><Icon name="clock" size={14} />{a.readingMinutes} min read</span>
          </p>
          <ButtonLink href={`/news/${a.slug}`}>Read Full Story <Icon name="arrowRight" size={18} /></ButtonLink>
        </div>
        <div className="hero__media">
          <ArticleImage image={a.image} ratio="4 / 3" eager sizes="(min-width: 1024px) 45vw, 100vw" />
          <div className="hero__scrim" aria-hidden="true" />
        </div>
      </div>

      {count > 1 ? (
        <div className="hero__controls">
          <div className="hero__dots" role="group" aria-label="Choose slide">
            {articles.map((s, i) => (
              <button key={s.id} type="button" className={`hero__dot ${i === index ? "is-active" : ""}`} aria-label={`Go to story ${i + 1}`} aria-current={i === index ? "true" : undefined} onClick={() => go(i)} />
            ))}
          </div>
          <div className="hero__arrows">
            <button type="button" className="icon-btn icon-btn--bordered" aria-label="Previous story" onClick={() => go(index - 1)}><Icon name="chevronLeft" /></button>
            <button type="button" className="icon-btn icon-btn--bordered" aria-label="Next story" onClick={() => go(index + 1)}><Icon name="chevronRight" /></button>
          </div>
        </div>
      ) : null}
      <p className="visually-hidden" aria-live={paused || !autoPlayMs ? "polite" : "off"}>Showing story {index + 1} of {count}: {a.title}</p>
    </section>
  );
}
