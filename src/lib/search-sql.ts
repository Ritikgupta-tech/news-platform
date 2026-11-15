/**
 * The ONE expression used for full-text matching and ranking. The optional GIN index in prisma/sql/fts-index.sql
 * must use exactly this text, otherwise Postgres cannot use it. Title weighs most, then summary, then body.
 */
export const FTS_VECTOR_SQL =
  `(setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(summary, '')), 'B') || setweight(to_tsvector('english', coalesce("bodyText", '')), 'C'))`;
