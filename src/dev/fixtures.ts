/**
 * DEV-ONLY PREVIEW DATA. Used exclusively by /design-system to exercise components.
 * It is NOT news content and must never be imported by production routes.
 * Real content arrives from the Articles API (Stage 5-6). Images are generated gradients, not photographs.
 */
import type { ArticleSummary, NotificationItem, RankedArticle, SessionUser } from "@/types/news";

function placeholder(h1: number, h2: number, label: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h1} 60% 38%)"/><stop offset="1" stop-color="hsl(${h2} 65% 62%)"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><circle cx="620" cy="140" r="160" fill="#fff" fill-opacity=".08"/><circle cx="140" cy="500" r="220" fill="#fff" fill-opacity=".06"/><text x="40" y="560" font-family="sans-serif" font-size="22" fill="#fff" fill-opacity=".55">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const cat = (slug: string, name: string) => ({ slug, name });
const by = (slug: string, name: string) => ({ slug, name });
const iso = (minsAgo: number) => new Date(Date.UTC(2026, 10, 10, 12, 0) - minsAgo * 60_000).toISOString();

export const PREVIEW_NOW = new Date(Date.UTC(2026, 10, 10, 12, 0));

function make(id: string, title: string, summary: string, c: [string, string], a: [string, string], minsAgo: number, read: number, hues: [number, number], extra: Partial<ArticleSummary> = {}): ArticleSummary {
  return {
    id, slug: `preview-${id}`, title, summary,
    category: cat(...c), author: by(...a), publishedAt: iso(minsAgo), readingMinutes: read,
    image: { url: placeholder(hues[0], hues[1], "Preview image"), alt: "Preview placeholder image" },
    ...extra,
  };
}

export const PREVIEW_HERO: ArticleSummary[] = [
  make("h1", "Sample headline: how a long editorial title wraps across several lines in the hero", "Placeholder summary text used to check line clamping, spacing and typography in the hero component. It is not real reporting.", ["technology", "Technology"], ["asha-verma", "Asha Verma"], 25, 6, [215, 195], { isBreaking: true }),
  make("h2", "Second sample slide to exercise the carousel controls", "Another placeholder summary that confirms previous, next and dot navigation behave correctly.", ["business", "Business"], ["rohan-iyer", "Rohan Iyer"], 140, 4, [160, 120]),
  make("h3", "Third sample slide", "Short placeholder summary.", ["health", "Health"], ["meera-nair", "Meera Nair"], 600, 5, [330, 20]),
];

export const PREVIEW_FEATURED: ArticleSummary[] = [
  make("f1", "Featured sample story with a moderately long headline for wrapping", "", ["world", "World"], ["asha-verma", "Asha Verma"], 90, 5, [240, 210]),
  make("f2", "Another featured sample story", "", ["science", "Science"], ["rohan-iyer", "Rohan Iyer"], 300, 7, [100, 150]),
  make("f3", "Third featured sample story headline", "", ["sports", "Sports"], ["meera-nair", "Meera Nair"], 1500, 3, [20, 50]),
];

export const PREVIEW_RANKED: RankedArticle[] = [
  { ...make("r1", "Most viewed sample one", "", ["world", "World"], ["a", "A"], 100, 4, [200, 180]), views: 48200 },
  { ...make("r2", "Most viewed sample two, with a longer headline that clamps to two lines", "", ["business", "Business"], ["a", "A"], 200, 4, [280, 250]), views: 31750 },
  { ...make("r3", "Most viewed sample three", "", ["technology", "Technology"], ["a", "A"], 300, 4, [60, 90]), views: 9400 },
  { ...make("r4", "Most viewed sample four", "", ["health", "Health"], ["a", "A"], 400, 4, [340, 300]), views: 870 },
];

export const PREVIEW_LATEST: ArticleSummary[] = [
  make("l1", "Latest feed sample: a headline long enough to test two-line wrapping in the row card layout", "Placeholder description to test the two-line clamp in the feed row. This sentence is intentionally long so that it must be truncated by the layout.", ["technology", "Technology"], ["asha-verma", "Asha Verma"], 45, 6, [210, 190]),
  make("l2", "Latest feed sample two", "Short placeholder description.", ["entertainment", "Entertainment"], ["rohan-iyer", "Rohan Iyer"], 180, 3, [300, 330]),
  make("l3", "Latest feed sample three", "Another short placeholder description for the feed.", ["sports", "Sports"], ["meera-nair", "Meera Nair"], 2900, 4, [30, 60]),
];

export const PREVIEW_USER: SessionUser = { name: "Preview Editor", email: "editor@example.test", roles: ["EDITOR"] };
export const PREVIEW_NOTIFICATIONS: NotificationItem[] = [
  { id: "n1", title: "Preview: article submitted for review", createdAt: iso(12), read: false, href: "/notifications" },
  { id: "n2", title: "Preview: revision requested", createdAt: iso(600), read: true },
];
