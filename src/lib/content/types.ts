import type { PageMeta } from "@/lib/api/pagination";
import type { ArticleSummary, AuthorRef, RankedArticle } from "@/types/news";
import type { PromoConfig } from "@/components/news/PromoBanner";

export interface TagRef { slug: string; name: string }

export interface ArticleDetail extends ArticleSummary {
  subtitle: string | null;
  /** Sanitized on write by the editorial service. Never pass unsanitized HTML here. */
  bodyHtml: string;
  updatedAt: string;
  imageCaption: string | null;
  imageCredit: string | null;
  tags: TagRef[];
  author: AuthorRef & { bio: string | null };
  source: { name: string; url: string } | null;
}

export interface CategoryView { slug: string; name: string; icon: string | null }
export interface AuthorView { slug: string; name: string; bio: string | null; avatarUrl: string | null; twitter: string | null }
export interface Paged<T> { items: T[]; meta: PageMeta }

export interface LatestOptions { page: number; pageSize: number; categorySlug?: string; authorSlug?: string }
export type SearchSort = "relevance" | "latest";
export interface SearchOptions { q: string; page: number; pageSize: number; sort?: SearchSort }

/** Read-side data access for public pages. Implementations must return PUBLISHED, non-deleted, already-live articles only. */
export interface ContentRepository {
  listLatest(opts: LatestOptions): Promise<Paged<ArticleSummary>>;
  listHero(limit: number): Promise<ArticleSummary[]>;
  listFeatured(limit: number): Promise<ArticleSummary[]>;
  listMostViewed(limit: number): Promise<RankedArticle[]>;
  listTrending(limit: number): Promise<RankedArticle[]>;
  getArticle(slug: string): Promise<ArticleDetail | null>;
  listRelated(slug: string, limit: number): Promise<ArticleSummary[]>;
  getAdjacent(slug: string): Promise<{ previous: ArticleSummary | null; next: ArticleSummary | null }>;
  listCategories(): Promise<CategoryView[]>;
  getCategory(slug: string): Promise<CategoryView | null>;
  search(opts: SearchOptions): Promise<Paged<ArticleSummary>>;
  getAuthor(slug: string): Promise<AuthorView | null>;
  getPromo(): Promise<PromoConfig | null>;
  listSitemapEntries(limit: number): Promise<{ slug: string; updatedAt: string }[]>;
}
