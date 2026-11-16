"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { ArticleImage } from "./ArticleImage";
import { ArticleMeta } from "./ArticleMeta";
import { Icon } from "@/components/ui/Icon";
import type { ArticleSummary } from "@/types/news";

const DESK_TABS = [
  { id: "all", label: "All Dispatches" },
  { id: "world", label: "World Affairs" },
  { id: "business", label: "Markets & Commerce" },
  { id: "lifestyle", label: "Culture & Living" },
  { id: "technology", label: "Technology" },
  { id: "sports", label: "Sport & Athletics" },
];

export function InteractiveFeed({ initialArticles }: { initialArticles: ArticleSummary[] }) {
  const [activeTab, setActiveTab] = useState("all");

  const filtered = useMemo(() => {
    if (activeTab === "all") return initialArticles;
    return initialArticles.filter((a) => a.category.slug === activeTab);
  }, [activeTab, initialArticles]);

  return (
    <div className="interactive-feed">
      {/* Editorial Filter Tabs */}
      <div className="desk-tabs-wrap" role="tablist" aria-label="Editorial Desks">
        <div className="desk-tabs">
          {DESK_TABS.map((tab) => {
            const isCurrent = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={isCurrent}
                className={`desk-tab ${isCurrent ? "is-active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span>{tab.label}</span>
                {isCurrent ? <span className="desk-tab__indicator" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filtered Feed */}
      <div className="feed feed--luxury" role="tabpanel">
        {filtered.length > 0 ? (
          filtered.map((article) => (
            <article key={article.id} className="row-card">
              <Link href={`/news/${article.slug}`} className="row-card__media" tabIndex={-1} aria-hidden="true">
                <ArticleImage image={article.image} ratio="16 / 10" />
              </Link>
              <div className="row-card__body">
                <div className="row-card__top">
                  <Badge tone={article.isBreaking ? "breaking" : "gold"}>
                    {article.category.name}
                  </Badge>
                  <span className="row-card__listen">
                    <Icon name="clock" size={13} />
                    {article.readingMinutes} min read
                  </span>
                </div>
                <h3 className="row-card__title">
                  <Link href={`/news/${article.slug}`}>{article.title}</Link>
                </h3>
                <p className="row-card__summary">{article.summary}</p>
                <ArticleMeta article={article} />
              </div>
            </article>
          ))
        ) : (
          <div className="feed-empty">
            <p>No dispatches found under this desk currently. Please check All Dispatches.</p>
            <button type="button" className="btn btn--sm btn--secondary" onClick={() => setActiveTab("all")}>
              Show All Stories
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
