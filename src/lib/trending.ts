/**
 * Trending score (documented, deterministic, no randomness).
 *
 *   score = W_VIEWS * ln(1 + uniqueViews7d)
 *         + W_ENGAGEMENT * ln(1 + engagementPoints7d)
 *         + W_RECENCY * 0.5 ^ (ageHours / HALF_LIFE_HOURS)
 *         + min(editorBoost, MAX_BOOST)
 *
 * - "uniqueViews" are ArticleView rows: one per (article, viewer, day), so refreshes do not inflate it.
 * - ln(1 + x) dampens large counts so one viral article cannot dominate indefinitely.
 * - The recency term halves every HALF_LIFE_HOURS, so older stories fade even with steady views.
 * - editorBoost is a small, capped nudge, never enough to outrank real traffic on its own.
 */
export const TRENDING = {
  W_VIEWS: 3,
  W_ENGAGEMENT: 4,
  W_RECENCY: 6,
  HALF_LIFE_HOURS: 18,
  MAX_BOOST: 5,
} as const;

/** Relative value of each engagement type when summed into `engagementPoints`. */
export const ENGAGEMENT_POINTS = { BOOKMARK: 3, SHARE: 3, COMMENT: 2, READ_COMPLETE: 1 } as const;

export interface TrendingInput {
  uniqueViews7d: number;
  engagementPoints7d: number;
  publishedAt: Date;
  editorBoost?: number;
}

export function trendingScore(input: TrendingInput, now: Date): number {
  const views = Math.max(0, input.uniqueViews7d);
  const eng = Math.max(0, input.engagementPoints7d);
  const ageHours = Math.max(0, (now.getTime() - input.publishedAt.getTime()) / 3_600_000);
  const boost = Math.min(Math.max(0, input.editorBoost ?? 0), TRENDING.MAX_BOOST);
  return (
    TRENDING.W_VIEWS * Math.log1p(views) +
    TRENDING.W_ENGAGEMENT * Math.log1p(eng) +
    TRENDING.W_RECENCY * Math.pow(0.5, ageHours / TRENDING.HALF_LIFE_HOURS) +
    boost
  );
}

/** Highest score first; ties broken by newer publish date, then id for stable output. */
export function rankTrending<T extends TrendingInput & { id: string }>(items: T[], now: Date, limit: number): T[] {
  return items
    .map((it) => ({ it, score: trendingScore(it, now) }))
    .sort((a, b) => b.score - a.score || b.it.publishedAt.getTime() - a.it.publishedAt.getTime() || a.it.id.localeCompare(b.it.id))
    .slice(0, limit)
    .map((x) => x.it);
}
