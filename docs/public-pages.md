# Public pages and content access (Stage 4)

## Data access
Public pages never call Prisma directly. They use `getContent()` from `src/lib/content`, which returns a `ContentRepository` (`src/lib/content/types.ts`).
- `prisma-repository.ts`: the real implementation. Only returns `PUBLISHED`, non-deleted articles whose `publishedAt <= now`.
- `src/dev/memory-repository.ts`: placeholder in-memory implementation for tests and the visual harness. Never imported by production code.
- Pages are `force-dynamic` for now (no database is needed at build time). Caching and cache invalidation on publish arrive with the performance stage.

## Routes added
`/` (live homepage), `/news`, `/news/[slug]`, `/category/[slug]`, `/search`, `/trending`, `/most-read`, `/authors/[slug]`, `/about`, `/contact`, `/privacy-policy`, `/terms`, `/newsletter`, plus `robots.txt` and `sitemap.xml`.
Each has a loading, error and not-found state through the `(site)` route group. Unknown category/author/article slugs return 404.

## Behaviour notes
- **Homepage:** every section is fetched independently. A failed section shows its own error; if everything fails the page shows one error; if nothing is published it shows an empty state. Hero uses editor-pinned `HERO` stories, then falls back to the newest stories with images.
- **Trending** (`src/lib/trending.ts`): `3*ln(1+uniqueViews7d) + 4*ln(1+engagementPoints7d) + 6*0.5^(ageHours/18) + min(editorBoost,5)`. Log damping stops one article dominating; recency halves every 18 hours; views are one per viewer per day. Engagement points: bookmark 3, share 3, comment 2, read-complete 1.
- **Most read:** unique daily views over 30 days. A view count is shown only when the analytics table has real rows.
- **Search:** input is trimmed, capped at 100 characters, LIKE wildcards and control characters stripped, page depth capped at 100. It currently uses case-insensitive substring matching on title, summary and body text, sorted newest first. Postgres full-text search with ranking, filters and suggestions are still to do. Result pages are `noindex`.
- **Article page:** breadcrumb, subheadline, byline with author link, updated date when materially later, lead image with caption and credit, share (X, Facebook, WhatsApp, copy link), reading progress bar, table of contents (3+ headings and 4+ minutes), tags, source attribution for imported items, author box, previous/next, related stories, canonical URL, Open Graph and Twitter metadata, `NewsArticle` and `BreadcrumbList` JSON-LD (escaped so content cannot close the script tag).
- **Body HTML** is rendered as-is and must already be sanitized when saved (editorial stage). Do not store unsanitized HTML.
- **Legal pages** are drafts and say so on the page; they need legal review.

## Not done in this stage
Bookmark and report buttons, comments, view counting and read-complete tracking, "load more" without reload, RSS feed, search filters/suggestions/history, real authentication (`src/lib/auth-stub.ts` always returns anonymous), timezone-aware dates (dates currently render in the server locale), `next/image`.
