/** View models consumed by UI components. Stage 5/6 APIs will return these shapes. */
export interface CategoryRef { slug: string; name: string }
export interface AuthorRef { slug: string; name: string; avatarUrl?: string | null }
export interface ArticleImage { url: string; alt: string; width?: number; height?: number }

export interface ArticleSummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: CategoryRef;
  author: AuthorRef;
  publishedAt: string; // ISO 8601, UTC
  readingMinutes: number;
  image: ArticleImage | null;
  isBreaking?: boolean;
}

export interface RankedArticle extends ArticleSummary {
  /** Real analytics metric only. Omit when unavailable; never invent a number. */
  views?: number;
}

export interface NotificationItem {
  id: string;
  title: string;
  createdAt: string;
  read: boolean;
  href?: string;
}

export interface SessionUser {
  id?: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  roles: string[];
}
