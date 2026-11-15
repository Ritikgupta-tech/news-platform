# Database design
Schema: `prisma/schema.prisma`. UUID keys, FK constraints, unique constraints, indexes on (status, publishedAt), (categoryId, status, publishedAt), (authorId, status), (scheduledFor).

- **Views:** `ArticleView` unique on (articleId, viewerKey, viewDate); viewerKey is a hash of user id or anonymous cookie id, never a raw IP. Refreshes cannot double count.
- **Soft delete:** User, Article, Comment, MediaAsset (`deletedAt`).
- **Search:** add after first migration: `CREATE INDEX article_fts_idx ON "Article" USING GIN (to_tsvector('english', title || ' ' || summary || ' ' || "bodyText"));`
- **Media:** only metadata in Postgres; files live in object storage.
- **Imported content** keeps `sourceName` / `sourceUrl` for attribution.

## Reader settings (Stage 7)
`User.preferences` (nullable JSON): `{ editorialNotifications: boolean, recordReadingHistory: boolean }`. Missing or damaged values read as "true" (defaults). Interests are the implicit many-to-many `User.interests` ↔ `Category`. Bookmarks and history are composite-key tables (`userId, articleId`), so duplicates are impossible.
