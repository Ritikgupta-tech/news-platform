# Analytics: how views are counted

## What is recorded
One `ArticleView` row per **(article, viewer, UTC day)**. The unique index makes counting idempotent: refreshes, repeated tracking events, two tabs and retries cannot add a second row. There is no random or placeholder data anywhere: the dashboard, Most Viewed and Trending read only these rows (plus real bookmarks as engagement).

## Flow
1. The article page mounts `ViewTracker`. After the page has been **visible for 3 s** (once per tab session) it calls `POST /api/v1/analytics/views {articleId}`.
2. The server skips the request (no row, no cookie) when: the browser sends `Sec-GPC: 1` or `DNT: 1`; the User-Agent is missing or looks automated (`src/lib/bots.ts`); the article is not live (unpublished, scheduled for later, archived or deleted).
3. Viewer identity: a signed-in reader is keyed by user id (so two devices count once per day); anyone else gets a random `enews_vid` cookie (HttpOnly, SameSite=Lax, 180 days, Path `/api/v1/analytics`, so it is not sent to any other URL).
4. The stored `viewerKey` is `HMAC-SHA256(JWT_REFRESH_SECRET, "view:" + id)` truncated to 32 hex chars. No IP address and no raw id is stored.
5. Rate limits: 120 views / hour per IP (only when `TRUST_PROXY=1` provides a real IP) and 200 / hour per viewer key.

## Trending and Most Viewed
- **Most Viewed**: unique daily views over the last 30 days, descending.
- **Trending**: see `src/lib/trending.ts` (log-damped unique views and engagement over 7 days, an 18-hour half-life recency term, capped editor boost). Deterministic; ties break by newer publish date, then id.

## Limits (be honest with stakeholders)
- A "view" means *a browser (or signed-in reader) that kept the page visible for 3 s, at most once a day*. It is not page loads and it is not people.
- A person who clears cookies or uses a private window counts again; a script that starts every request without a cookie and fakes a browser User-Agent can still inflate counts (the per-IP limit helps only when a real IP is available). Do not use these numbers for billing.
- Readers with JavaScript disabled, and those who send Global Privacy Control, are not counted.
- Not built: a retention/aggregation job (the table grows by up to one row per reader per article per day).

## Reports (Stage 14)
- Endpoints and screens: `GET /api/v1/analytics/{overview,articles,categories,authors,trending}`, `/admin/analytics` (editors, admins) and `/admin/authors`. Code: `src/server/analytics/reports.ts`; range rules: `src/lib/date-range.ts`.
- Ranges are **UTC whole days, both ends inclusive**, because views are stored per UTC date. Presets: today, 7d, 30d, 90d; custom `from`/`to` up to 366 days. The "previous period" is the equal-length window just before the range.
- Daily series are zero-filled from real rows; nothing is estimated. "Change vs previous period" is `n/a` when the earlier period has no views (no invented 100%).
- Authors can read `GET /analytics/articles` for **their own** articles only; the scope is derived from their role on the server.
- Limits: the category and author reports group per-article counts in application code (one query for views, one for owners), which is fine for thousands of articles; at larger scale move them to SQL joins or a daily rollup table. Unique-reader counts across articles are not reported (a "view" is per article per day). The dashboard at `/admin` still has its own 1/7/30-day tabs; it was not changed.
