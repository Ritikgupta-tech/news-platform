# API reference (implemented endpoints)

Base path `/api/v1`. JSON only. Success: `{ "data": ..., "meta"?: { page, pageSize, total, totalPages, hasNext } }`.
Error: `{ "error": { "code", "message", "details?", "requestId" } }`. Every response carries `X-Request-Id`.

Authentication is by HttpOnly cookies set by the auth endpoints; tokens are never returned in response bodies.
Every state-changing request (POST/PATCH/DELETE) must be same-origin (`Origin` or `Sec-Fetch-Site: same-origin`), otherwise `403`.

| Method & path | Auth | Purpose |
|---|---|---|
| POST `/auth/register` | none | Create READER account, sign in. 409 if email exists. Rate limited 10/h per IP |
| POST `/auth/login` | none | Sign in. Limited 8/15 min per email, 30/15 min per IP. Uniform 401 |
| POST `/auth/logout` | cookie | Revoke session, clear cookies. Form posts get a 303 to `/`, API clients 204 |
| POST `/auth/refresh` | refresh cookie | Rotate refresh token + new access token |
| GET `/auth/session-refresh?next=` | refresh cookie | Browser silent refresh used by the middleware; `next` must be a same-site path |
| POST `/auth/forgot-password` | none | Always 202, never reveals whether the email exists |
| POST `/auth/reset-password` | reset token | Single-use, 1 h; signs out every device |
| GET `/auth/me` | cookie | Current user (`Cache-Control: private, no-store`) |
| GET `/articles` | public / cookie | `scope=public` (default, published only) · `mine` · `review` (article:review) · `all` (article:edit_any). Filters `category`, `tag`, `author`, `status`, `page`, `pageSize` (max 50) |
| POST `/articles` | author+ | Create DRAFT (body sanitized, slug unique, tags upserted, revision v1) |
| GET `/articles/{slug-or-uuid}` | public / cookie | Slug: public published article. UUID: any article the caller may see |
| PATCH `/articles/{id}` | owner or editor | Requires `version`; stale version → 409 `VERSION_CONFLICT` |
| DELETE `/articles/{id}` | owner (draft) / admin | Soft delete |
| GET `/categories` · `/categories/{slug-or-id}` | public | Active categories (`includeInactive=true` only honoured for managers) |
| POST/PATCH/DELETE `/categories[/{id}]` | category:manage | Delete refused (409) while articles exist |
| GET `/tags` · POST `/tags` · PATCH/DELETE `/tags/{id}` | public / tag:manage | |
| GET `/admin/users` | user:manage | Filter `q`, `role` |
| PATCH `/admin/users/{id}/role` | user:manage | Replace roles (READER always kept). Cannot remove your own admin role or the last admin |
| PATCH `/admin/users/{id}/author-grant` | user:manage | Toggle direct-publish right |
| GET `/admin/audit-logs` | audit:view | Filters `entityType`, `action` (prefix), `actorId` |
| POST `/articles/{id}/submit` | owner, editor | DRAFT or CHANGES_REQUESTED → SUBMITTED; notifies editors/admins |
| POST `/articles/{id}/start-review` | article:review | SUBMITTED → IN_REVIEW |
| POST `/articles/{id}/request-changes` | article:review | IN_REVIEW → CHANGES_REQUESTED. `reason` (10+ chars) required; notifies the author |
| POST `/articles/{id}/approve` | article:review | IN_REVIEW → APPROVED. Optional `note` |
| POST `/articles/{id}/reject` | article:review | IN_REVIEW → ARCHIVED. `reason` required; notifies the author |
| POST `/articles/{id}/publish` | article:publish (or author with grant, from DRAFT) | APPROVED / SCHEDULED / DRAFT(grant) → PUBLISHED |
| POST `/articles/{id}/schedule` | article:publish | APPROVED → SCHEDULED. `scheduledFor` (ISO with offset) **or** `localDateTime` + `timezone` (IANA). 1 min to 1 year ahead |
| POST `/articles/{id}/cancel-schedule` | article:publish | SCHEDULED → APPROVED |
| POST `/articles/{id}/archive` | article:archive | PUBLISHED → ARCHIVED |
| GET `/articles/{id}/reviews` | owner / staff | Review decisions with reasons and reviewer |
| GET `/articles/{id}/revisions` | owner / staff | Full revision history (newest first) |
| GET `/notifications` | cookie | Own notifications, newest first; `meta.unreadCount`; `unreadOnly=true` |
| POST `/notifications/read` | cookie | `{ "ids": [...] }` or `{ "all": true }` — only your own are affected |
| POST `/internal/jobs/publish-scheduled` | `Authorization: Bearer $CRON_SECRET` | Publishes due scheduled articles. 404 if `CRON_SECRET` is unset, 401 on a wrong secret |
| GET `/bookmarks` · POST `/bookmarks` `{articleId}` · DELETE `/bookmarks/{articleId}` | cookie | Saved articles. Only live published articles can be saved; idempotent; max 500; you can only ever touch your own |
| GET `/reading-history` · POST `/reading-history` `{articleId}` · DELETE `/reading-history[/{articleId}]` | cookie | Private history. POST is a no-op (`recorded:false`) when the reader turned recording off; keeps the newest 500 |
| GET / PUT `/preferences` | cookie | `interests` (category ids, max 12), `editorialNotifications`, `recordReadingHistory`. Partial updates leave other settings alone |
| PATCH `/account` | cookie | `name`, `timezone` (e-mail cannot be changed here) |
| POST `/account/password` | cookie | `currentPassword` + `newPassword`; signs out every other device; 5 attempts / 15 min |
| POST `/account/sessions/revoke-others` | cookie | Sign out of all other devices |
| GET `/account/export` | cookie | Downloads all your data as JSON (3 / hour). Never contains password or token hashes |
| POST `/account/delete` | cookie | `{password, confirm:"DELETE"}`. Erases personal data, ends all sessions; the last administrator cannot delete themselves |
| GET `/admin/dashboard` | analytics:view_all | Real counts: articles by status, readers, subscribers, views in range (`days` 1–365, default 30), top articles, per-category performance, last 8 audit entries |
| GET `/admin/homepage` | featured:manage | Pinned stories per slot, up to 40 pinnable published stories, current banner |
| PUT `/admin/homepage/slots/{hero\|featured}` | featured:manage | `{articleIds:[...]}` replaces the slot in order. Max 5 hero / 3 featured; live published stories only; moves an article out of its other slot |
| PUT / DELETE `/admin/homepage/promo` | homepage:manage | Set or remove the banner (`title`, `ctaLabel`, `ctaHref`, optional `eyebrow`, `body`) |
| POST `/media` | article:create | multipart `file` + `altText` (3–200), optional `caption`, `credit`. JPEG/PNG/WebP up to 5 MB, 30 / hour. Returns `{id,url,width,height,...}`; use `id` as an article's `heroImageId` |
| DELETE `/media/{id}` | uploader or editor/admin | 409 while an article uses it |
| GET `/media/{key}` (not under `/api`) | none | Serves the stored image with its verified type |
| POST `/analytics/views` `{articleId}` | none (cookie optional) | Records a view. At most one per viewer per article per UTC day. Always 200 `{counted}`; crawlers, `Sec-GPC`/`DNT` browsers and non-live articles are not counted. Sets an HttpOnly `enews_vid` cookie (Path `/api/v1/analytics`) for anonymous browsers only |
| POST `/newsletter/subscribe` `{email, consent:true}` | none | Double opt-in: stores the consent record, e-mails a confirmation link, 201 `{status:"pending"}`. 409 if already subscribed, 422 without consent, 429 over 3 / hour per address, 503 if the mail could not be sent |
| POST `/newsletter/verify` `{token}` | none | Confirms the address (link valid 7 days). Idempotent. 400 `INVALID_TOKEN` for unknown/expired links |
| POST `/newsletter/unsubscribe` `{token}` | signed link | Token is the HMAC-signed link from our e-mails; an address typed by a stranger cannot unsubscribe anyone. Idempotent, never expires |
| GET `/admin/newsletter/subscribers` | newsletter:manage | `status`, `page`, `pageSize`; `meta.counts` per status. Never returns tokens or IP hashes |
| GET `/search` | none | `q` (2-100 chars), `page`, `pageSize` (1-20), `sort=relevance\|latest`. Full-text, live published articles only. 422 for a missing/short query |
| GET `/feed.xml` (not under `/api`) | none | RSS 2.0, 30 newest articles |
| GET `/articles/{idOrSlug}/comments` · POST same `{body}` | read: none / write: cookie | Visible + reported comments, oldest first; `mine` marks yours. POST 2-1500 chars, 10 / hour, live articles only |
| DELETE `/comments/{id}` | owner or comment:moderate | Soft delete, audited. Someone else's comment is 404 for non-moderators |
| PATCH `/comments/{id}` `{status:"HIDDEN"\|"VISIBLE"}` | comment:moderate | Hide or restore (also dismisses a report) |
| POST `/comments/{id}/report` | cookie | Flags a visible comment; idempotent; 409 on your own; 20 / hour |
| GET `/admin/comments` | comment:moderate | `status` filter (default: reported + hidden), `page`, `pageSize` |
| GET `/analytics/overview` | analytics:view_all | `preset=today\|7d\|30d\|90d` (default 7d) or `from`/`to` (`YYYY-MM-DD`, UTC, inclusive, max 366 days; a future `to` is cut back to today and `range.clamped` is true). Returns total views, the previous period of equal length, `changePercent` (null when there is nothing to compare), a zero-filled daily series, articles published, new readers, new confirmed subscribers, engagement by type. Bad range -> 422 |
| GET `/analytics/articles` | analytics:view_own or view_all | Same range inputs plus `limit` (1-50, default 10). Top articles by views with engagement. **Scope comes from the caller's role, not the query**: editors/admins see all (`scope:"all"`), authors only their own (`scope:"own"`) |
| GET `/analytics/categories` · `/analytics/authors` | analytics:view_all | Views per category and output/views per author for the range |
| GET `/analytics/trending` | none | `limit` (1-20). The same ranking as `/trending` (`src/lib/trending.ts`), published stories only, cached publicly for 60 s |
| GET / POST `/admin/newsletter/campaigns` | newsletter:manage (admins) | List (`status`, `page`, `pageSize`) with delivery counts / create a draft `{subject (3-150, one line), body (20-20000 chars, plain text)}` |
| GET / PATCH `/admin/newsletter/campaigns/{id}` | newsletter:manage | Detail (counts, first 20 failures, active subscriber count) / edit a **draft** `{subject, body, version}`; 409 `VERSION_CONFLICT` on a stale version, 422 once it is no longer a draft |
| POST `/admin/newsletter/campaigns/{id}/schedule` `{scheduledAt?}` | newsletter:manage | DRAFT -> SCHEDULED. ISO UTC time (not more than 5 min in the past, at most 1 year ahead); omit to send at the next job run |
| POST `/admin/newsletter/campaigns/{id}/cancel` | newsletter:manage | SCHEDULED -> DRAFT, or SENDING -> CANCELLED (unsent deliveries are skipped; mails already accepted by the provider cannot be recalled) |
| POST `/admin/newsletter/campaigns/{id}/test` | newsletter:manage | Sends the draft to the **caller's own address only**, no unsubscribe link, 10 / hour |
| POST `/internal/jobs/send-campaigns` | `Authorization: Bearer $CRON_SECRET` | Sends due campaigns in a 45 s time box; run it every minute (or `npm run job:send-campaigns`). 404 without `CRON_SECRET` |
| POST `/newsletter/one-click?token=` | signed token | RFC 8058 one-click unsubscribe target for the `List-Unsubscribe` header. POST only (scanners cannot unsubscribe people with a GET). Idempotent, 60 / hour per IP |
| GET `/health` | none | Liveness |

Every editorial action body must include `version` (the version you loaded). A mismatch returns 409 `VERSION_CONFLICT`.
An invalid starting state returns 422 `INVALID_TRANSITION`; a caller who may not see the article gets 404, one who may see it but not act gets 403.

Error codes: VALIDATION_ERROR 422 · INVALID_TOKEN 400 · UNAUTHENTICATED 401 · FORBIDDEN 403 · NOT_FOUND 404 · CONFLICT 409 · VERSION_CONFLICT 409 · INVALID_TRANSITION 422 · RATE_LIMITED 429 · PAYLOAD_TOO_LARGE 413 · INTERNAL_ERROR 500.

Not implemented yet (see PROGRESS.md): bounce/complaint webhooks, image resizing, search suggestions and filters.
