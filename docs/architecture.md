# Architecture

- **Single Next.js app** (no monorepo): server components for SEO pages, route handlers under `/api/v1/*` for the REST API. One deploy, one language, shared Zod schemas.
- **PostgreSQL + Prisma**: relational integrity, transactions for publishing, built-in full-text search to start. Meilisearch only if scale demands it.
- **Redis**: rate limiting, cache, job locks (introduced when first needed).
- **Layering:** route handler (thin) -> service (business rules) -> Prisma. No business logic in React components.
- **Authorization is server-side**: `can(roles, permission)` plus resource ownership checks (IDOR protection) in services.
- **Time:** UTC in the database, converted to the reader's timezone at render.

## API conventions
- Success: `{ "data": T, "meta"?: {...} }`
- Error: `{ "error": { "code", "message", "details?", "requestId" } }`
- Codes: VALIDATION_ERROR(422) UNAUTHENTICATED(401) FORBIDDEN(403) NOT_FOUND(404) CONFLICT(409) VERSION_CONFLICT(409) INVALID_TRANSITION(422) RATE_LIMITED(429) INTERNAL_ERROR(500)
- Pagination: `?page=1&pageSize=10` (max 50) with `meta: { page, pageSize, total, totalPages, hasNext }`
- Every response carries `X-Request-Id`. Unknown errors are logged server-side only.


## Backend layout (Stage 5)
```
src/server/
  auth/        password (Argon2id) · jwt (edge-safe) · tokens (opaque) · cookies · service · guard · http · current-user
  security/    rate-limit (interface + in-memory) · csrf (same-origin)
  articles/    validation · policy (pure authorization rules) · service
  categories/  tags/  users/   service modules (validation schemas live beside the service)
  content/     sanitize (HTML allow-list)
  audit/       append-only audit writer
  mail/        Mailer adapter (console / memory)
  container.ts explicit dependencies {db, env, mailer, now} passed to services
src/app/api/v1/**/route.ts   thin handlers: parse -> auth -> service -> envelope
src/middleware.ts            edge-safe silent session refresh
```
Services take `Deps` explicitly, so integration tests inject a test database, clock and mailer without mocking.
Database access uses Prisma with `engineType = "client"` and `@prisma/adapter-pg`; `src/lib/db.ts` creates the client lazily.
