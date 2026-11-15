-- Optional, run once after `prisma migrate`: speeds up search on large tables. Search works without it (sequential scan).
-- The expression must match FTS_VECTOR_SQL in src/lib/search-sql.ts exactly.
CREATE INDEX IF NOT EXISTS "Article_fts_idx" ON "Article" USING GIN (
  (setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(summary, '')), 'B') || setweight(to_tsvector('english', coalesce("bodyText", '')), 'C'))
);
