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
  /** Auto-advance interval in ms. Default 6500ms for luxury magazine pacing. */
  autoPlayMs?: number;
}

export function HeroCarousel({ articles, autoPlayMs = 6500 }: Props) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const touchX = useRef<number | null>(null);
  const count = articles.length;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const update = () => setReduced(mq.matches);
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
      className="hero hero--luxury"
      aria-roledescription="carousel"
      aria-label="Lead Editorial Stories"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        const end = e.changedTouches[0]?.clientX;
        touchX.current = null;
        if (start === null || end === undefined || Math.abs(end - start) < 48) return;
        go(index + (end < start ? 1 : -1));
      }}
    >
      {/* Top Countdown Progress Indicator */}
      {count > 1 && !reduced && (
        <div className="hero__progress-track" aria-hidden="true">
          <div
            key={index}
            className={`hero__progress-bar ${paused ? "is-paused" : ""}`}
            style={{ animationDuration: `${autoPlayMs}ms` }}
          />
        </div>
      )}

      <div className="hero__slide" key={a.id} role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${count}`}>
        <div className="hero__text">
          <div className="hero__badges">
            <span className="cover-tag">COVER STORY</span>
            {a.isBreaking ? <Badge tone="breaking">Breaking Bulletin</Badge> : null}
            <Badge tone="gold">{a.category.name}</Badge>
          </div>

          <h1 className="hero__title">
            <Link href={`/news/${a.slug}`}>{a.title}</Link>
          </h1>

          <p className="hero__summary">{a.summary}</p>

          <div className="hero__meta-row">
            <div className="hero__author">
              <span className="avatar avatar--sm" aria-hidden="true">
                {a.author.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="author-name">{a.author.name}</span>
            </div>
            <span className="meta-sep" aria-hidden="true">•</span>
            <time dateTime={a.publishedAt} className="meta-date">{formatDate(a.publishedAt)}</time>
            <span className="meta-sep" aria-hidden="true">•</span>
            <span className="meta__read">
              <Icon name="clock" size={14} />
              {a.readingMinutes} min read
            </span>
          </div>

          <div className="hero__cta">
            <ButtonLink href={`/news/${a.slug}`} className="btn--luxury-action">
              <span>Read Cover Story</span>
              <Icon name="arrowRight" size={18} />
            </ButtonLink>
          </div>
        </div>

        <div className="hero__media">
          <Link href={`/news/${a.slug}`} tabIndex={-1} aria-hidden="true" className="hero__media-link">
            <ArticleImage image={a.image} ratio="16 / 11" eager sizes="(min-width: 1024px) 52vw, 100vw" />
            <div className="hero__scrim" aria-hidden="true" />
            <div className="hero__media-badge" aria-hidden="true">
              <span>Feature {String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}</span>
            </div>
          </Link>
        </div>
      </div>

      {count > 1 ? (
        <div className="hero__controls">
          <div className="hero__counter" aria-hidden="true">
            <span className="hero__counter-current">{String(index + 1).padStart(2, "0")}</span>
            <span className="hero__counter-divider">/</span>
            <span className="hero__counter-total">{String(count).padStart(2, "0")}</span>
          </div>

          <div className="hero__dots" role="group" aria-label="Choose story">
            {articles.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={`hero__dot ${i === index ? "is-active" : ""}`}
                aria-label={`Go to story ${i + 1}`}
                aria-current={i === index ? "true" : undefined}
                onClick={() => go(i)}
              />
            ))}
          </div>

          <div className="hero__arrows">
            <button
              type="button"
              className="icon-btn hero-nav-btn"
              aria-label="Previous story"
              onClick={() => go(index - 1)}
            >
              <Icon name="chevronLeft" size={18} />
            </button>
            <button
              type="button"
              className="icon-btn hero-nav-btn"
              aria-label="Next story"
              onClick={() => go(index + 1)}
            >
              <Icon name="chevronRight" size={18} />
            </button>
          </div>
        </div>
      ) : null}

      <p className="visually-hidden" aria-live={paused || !autoPlayMs ? "polite" : "off"}>
        Showing story {index + 1} of {count}: {a.title}
      </p>
    </section>
  );
}
