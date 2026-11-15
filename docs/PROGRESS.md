# Progress report

## Stage 15: newsletter campaigns and a real mail adapter (v0.16.0)

Delivered: **campaigns** (write, edit, test, schedule, cancel) at `/admin/newsletters/campaigns`, a **sender job** with per-recipient delivery tracking, a **Resend adapter** behind the existing `Mailer` interface, `List-Unsubscribe` one-click support, and a shared cron-auth guard. Rules and endpoints: `docs/api.md`, `docs/security.md` ("Newsletter campaigns"), setup: README.

- Schema (needs a migration): enums `CampaignStatus`, `DeliveryStatus`; `NewsletterCampaign` gains `bodyText`, `status`, `version`, `startedAt`, `recipientsAt`, `createdById`, `updatedAt`; new `NewsletterDelivery` (unique per campaign + subscriber).
- Lifecycle: DRAFT -> SCHEDULED -> SENDING -> SENT, with SCHEDULED -> DRAFT and SENDING -> CANCELLED. Edits only in DRAFT, guarded by `version`.
- Sending: time-boxed (45 s) and resumable; 5 in parallel; transient errors retried on later runs up to 3 attempts; rejected addresses -> FAILED (subscription untouched); settings errors abort and leave everything queued; 5 failures in a row stop the run; consent re-checked at send time; no duplicates (unique key + claim-before-send); stale in-flight sends are marked FAILED, never re-sent.
- `MAIL_PROVIDER=console|resend`; a misconfiguration breaks mail only (not every page).

### Verified
- **Run here:** 14 assertions (`tests/newsletter-unit.test.ts`) for the e-mail renderer (escaping, paragraphs, https-only links, attribute break-out, footer/headers, test sends) and the Resend adapter against a fake `fetch` (request shape, status -> error kind for 401/403/404/400/422/429/503/network, no key leakage, CR/LF refusal, `createMailer` configurations). I also **broke the code on purpose** (removed `<` escaping, mis-mapped 422) and confirmed 2 tests fail, then restored it.
- Syntax of all new/changed files parses (0 errors).
- **Not run:** `prisma validate/generate` for the new models, `tsc --noEmit`, `next build`, real Vitest, the 14 new integration tests in `tests/integration/newsletter-campaigns.test.ts` (need `TEST_DATABASE_URL`), a real Resend send, and any browser check of the three new screens.
- Highest-risk lines: `createMany({skipDuplicates})` for the recipient freeze; `groupBy(["campaignId","status"])`; the `notIn` filter in the batch query; Prisma enum names in `updateMany` filters; the Resend request/response shape is written from its public docs and was not called.

### Limits / decisions you may want to change
- **Only admins** can manage campaigns (`newsletter:manage`; editors cannot), matching the existing subscriber screen.
- **Recipients are frozen when sending starts**: someone who confirms later does not get that campaign; someone who unsubscribes later is skipped.
- "Sent" = accepted by the provider. **No bounce or spam-complaint webhook yet**, so hard bounces are not suppressed automatically and delivery to the inbox is not confirmed. Verify your sending domain (SPF/DKIM) with the provider.
- Plain-text authoring only (no rich editor, images or templates); no open/click tracking by design (privacy).
- No "retry failed" button; failed rows are listed (first 20) with the reason.
- Without something calling the job, scheduled campaigns never go out (same as scheduled articles).
- No per-day or per-hour provider throttle beyond 5 parallel sends; check your provider's rate limits for large lists.

### Still not built (carried over)
Provider webhooks, advertisements and `/admin/advertisements`, site settings (`/admin/settings`), email verification at registration, image resizing/S3, CSP, Redis rate limiter, committed `prisma migrate`, search suggestions/filters, "report article", Playwright journeys for newsletter/admin/comments, the final security / performance / accessibility pass, and the optional AI assistant and news-ingestion modules.

---

*History:*

## Stage 14: analytics reports and authors (v0.15.0)

Delivered: real read endpoints for analytics with **custom date ranges**, an **`/admin/analytics`** screen (preset tabs + custom from/to form, views per day, change vs previous period, top articles with saves/comments, category performance) and an **`/admin/authors`** screen (published / in workflow / drafts / views per author). Details and limits: `docs/analytics.md` ("Reports"), endpoints: `docs/api.md`.

- API: `GET /api/v1/analytics/overview`, `/articles`, `/categories`, `/authors` (private, no-store) and the public `/analytics/trending`.
- Rules: UTC whole-day inclusive ranges, max 366 days, a future end date is clamped to today (and reported), invalid ranges return 422 (never 500); editors/admins see site-wide reports; authors can read only their own articles' stats through `/analytics/articles`, decided from their role, not from a parameter; readers get 403.

### Verified
- **Run here:** 16 assertions for `src/lib/date-range.ts` (`tests/date-range.test.ts`: strict date parsing incl. leap days, presets, prototype-name presets, inclusive ends, clamping, 366-day limit, previous period, zero-filled series, percent change) under a stand-in runner on Node 22. **This found and fixed one bug:** an empty `?preset=` was rejected instead of defaulting to 7 days.
- Syntax of all 14 new/changed files parses (0 errors).
- **Not run:** `tsc --noEmit`, `next build`, the real Vitest run of `tests/date-range.test.ts`, the 8 new integration tests in `tests/integration/analytics-reports.test.ts` (need `TEST_DATABASE_URL`), and any browser check of `/admin/analytics` and `/admin/authors` (390 px overflow, keyboard order, contrast, the bar chart's hidden data table). No database, packages or network in this sandbox.
- Highest-risk lines: `groupBy` with `orderBy: [{ _count: { articleId: "desc" } }, { articleId: "asc" }]` and `take`; filtering `articleView.groupBy` through the `article` relation (`where: { article: { authorId } }`); `@db.Date` comparison with `gte/lte` UTC midnights.

### Limits / decisions
- Bars are plain CSS (no chart library); heights are relative to the busiest day, with exact numbers in a visually hidden table.
- `/admin/authors` is read-only: roles and the direct-publish grant stay in `/admin/users`. Editors can open it (it needs `analytics:view_all`); the spec lists it as an admin page, so tighten the permission if editors should not see per-author readership.
- The author dashboard still uses its own queries; it does not yet call `/analytics/articles`.
- The `/admin` dashboard is unchanged (1 / 7 / 30 days only).

### Still not built (carried over)
Newsletter campaigns/delivery, a real mail provider, advertisements and `/admin/advertisements`, site settings (`/admin/settings`), email verification at registration, image resizing/S3, CSP, Redis rate limiter, committed `prisma migrate`, search suggestions/filters, "report article", Playwright journeys for newsletter/admin/comments, the final security / performance / accessibility pass, and the optional AI assistant and news-ingestion modules.

---

*History:*

## Stage 13: comments and moderation (v0.14.0)

Delivered: a comment section on every article (`#comments`), plain-text comments from signed-in readers (2-1500 chars, 10 per hour), delete own comment, **report** a comment, and a moderator screen **`/admin/comments`** (Needs attention = reported + hidden, plus per-status tabs; hide, restore, dismiss report, delete). Moderators are editors and admins (`comment:moderate`).

- API: `GET/POST /api/v1/articles/{idOrSlug}/comments`, `DELETE /comments/{id}` (owner or moderator, soft delete), `PATCH /comments/{id}` `{status: HIDDEN|VISIBLE}` (moderators), `POST /comments/{id}/report`, `GET /admin/comments`.
- Rules: only live published articles; bodies are stored and rendered as plain text (React escapes; no HTML); a reported comment stays visible until a moderator hides it; hidden or deleted comments never appear publicly; others' comments look like 404; every delete, report, hide and restore is audited; a comment adds one real `COMMENT` engagement per reader per article for the trending score.

### Verified
- Syntax of all 11 new/changed files parses (0 errors). **Nothing else ran**: typecheck, build, the 5 new integration tests in `tests/integration/comments.test.ts`, and any browser check are all still to do on your machine (no database or installed packages here).

### Limits / decisions
- Comments are always on; there is no per-article or site-wide switch, no threading or replies, no editing after posting, no pagination UI (the first 50 are shown), no e-mail or in-app notification to the article author.
- Who reported a comment is in the audit log only (no separate report table), so one person cannot be limited to one report per comment beyond idempotence.
- "Report article" from the brief (flagging an article, not a comment) is **not** built.
- Comments by a deleted account stay, shown under the anonymised name.

### Still not built (carried over)
Newsletter campaigns/delivery, a real mail provider, advertisements and `/admin/advertisements`, site settings, `/admin/analytics`, `/admin/authors`, email verification at registration, image resizing/S3, CSP, Redis rate limiter, committed `prisma migrate`, search suggestions/filters, Playwright journeys for newsletter/admin/comments, the final security / performance / accessibility pass, and the AI assistant and news-ingestion modules (optional).

---

*History:*

## Stage 12: full-text search and RSS (v0.13.0)

Delivered:
- **Full-text search** in `prismaContentRepository.search`: Postgres `websearch_to_tsquery` over title (weight A), summary (B) and body (C), stemmed ("satellites" finds "satellite"), ranked by `ts_rank`, with `sort=relevance|latest` and pagination. Falls back to a substring match when full-text finds nothing (half-typed words). Only live published articles; every value is a bound parameter.
- `GET /api/v1/search?q=&page=&pageSize=&sort=` (public; 2-100 chars, page size max 20, 60/min per IP when a real IP is known), a **Most relevant / Latest** switch on `/search`.
- **RSS 2.0** at `/feed.xml` (30 newest, summaries only, valid XML escaping), auto-discovery link in every page head, footer link.
- Optional GIN index script `prisma/sql/fts-index.sql` (search works without it; add it when the table is large). The index expression and the query share one constant, `src/lib/search-sql.ts`.

### Verified
- **Run here:** RSS escaping / feed structure / empty feed and sort parsing (9 assertions) under a stand-in runner; syntax of all 12 changed files parses.
- **Not run:** typecheck, build, the 5 new integration tests in `tests/integration/search.test.ts`, the real Vitest file `tests/stage12-unit.test.ts`, any browser check, and the raw SQL against a real PostgreSQL (highest risk: quoted column names / enum comparison in the raw query, and the Prisma 6.19 `$queryRaw` parameter typing for `OFFSET`/`LIMIT`).

### Not built (search)
Debounced suggestions, per-user search history, category/tag/author/date filters, highlighted snippets, a dedicated engine (Meilisearch). Search is English-only.

### Still not built (carried over)
Newsletter campaigns/delivery, a real mail provider, comments, advertisements, site settings, email verification at registration, image resizing/S3, CSP, Redis rate limiter, committed `prisma migrate`, analytics read endpoints, newsletter/admin Playwright journeys, final security / performance / accessibility pass.

---

*History:*

## Stage 11: view analytics and newsletter (v0.12.0)

Delivered:
- **View collection** that feeds the dashboard, Most Viewed and Trending (which previously always showed zero): `POST /api/v1/analytics/views`, a `ViewTracker` on the article page, one view per viewer per article per UTC day, bots / Global Privacy Control / unpublished articles ignored, hashed viewer keys, scoped HttpOnly cookie. Full description and limits: `docs/analytics.md`.
- **Newsletter with double opt-in**: `POST /api/v1/newsletter/subscribe` (consent record, confirmation mail, duplicate -> 409, validation, rate limits), `/verify`, `/unsubscribe` (signed link), pages `/newsletter/confirm` and `/newsletter/unsubscribe` (button-confirmed so mail scanners cannot act), admin list `GET /api/v1/admin/newsletter/subscribers` and screen **`/admin/newsletters`** (status filter, real counts). The existing homepage newsletter card now talks to a real endpoint.

### Verified
- **Run for real here:** 21 pure-logic checks (bot filter, signed unsubscribe token: round trip, tampering, wrong id, wrong secret, junk) under a stand-in runner. This found and fixed one bug (Facebook's link-preview crawler was not recognised as a bot).
- Syntax of all 21 new/changed TypeScript files parses (0 errors).

### NOT verified (same sandbox limits as Stages 8-9: no network, no PostgreSQL server, no Next/Prisma/Vitest installed)
- `tsc --noEmit`, `next build`, and the **new integration tests**: `tests/integration/newsletter.test.ts` (9) and `tests/integration/views.test.ts` (5), plus `tests/stage11-unit.test.ts` under the real Vitest.
- Any browser check of `/newsletter/confirm`, `/newsletter/unsubscribe`, `/admin/newsletters`, or the tracker firing in a real page (the 390 px overflow check, keyboard order and contrast are untested).
- Highest-risk lines: `createMany({skipDuplicates})` return count in `recordView`; `z.literal(true, {errorMap})` message wording; `groupBy` on `status` in `listSubscribers`.

### Decisions you may want to change
- Already-active address -> **409 "already subscribed"** as the brief asks; this reveals subscription status (rate limited; see `docs/security.md`).
- Confirmation links last 7 days (measured from the latest consent time); unsubscribe links never expire.
- Views honour `Sec-GPC` / `DNT` (not counted). Remove the check in `analytics/views/route.ts` if you prefer to count them.
- A subscriber whose confirmation mail fails stays PENDING and the visitor is told to retry (503).

### Still not built
Newsletter **campaigns, scheduling, delivery tracking and bounce handling**, a real e-mail provider adapter (only the console/memory mailer exists, so no real mail is sent), comments and moderation, advertisements, site settings, the full-text **search endpoint** (search is still a substring match), e-mail verification at registration, RSS feed, image resizing / S3 storage, CSP, Redis rate limiter, `prisma migrate` (no migration committed), analytics read endpoints and custom date ranges, and the final security / performance / accessibility pass. The Playwright journeys for newsletter and admin are not written.

---

*History:*

## Stage 9: media upload (v0.11.0)

Delivered: secure image upload for articles. The article editor now has a **Main image** field (file, required alt text, optional caption and photographer credit, preview, remove). The public article page already showed the hero image, caption and credit from the media record.

- `POST /api/v1/media` (multipart: `file`, `altText`, optional `caption`, `credit`) and `DELETE /api/v1/media/{id}`; images are served from `/media/{key}`.
- **The file type is decided from the file's own bytes** (JPEG, PNG, WebP only). The filename and browser-declared type are ignored. SVG, GIF and anything else are refused; so are files over 5 MB, zero-size files and absurd dimensions (over 12,000 px a side or 60 megapixels, which blocks "decompression bomb" images).
- Stored under a server-generated random name (never the uploaded name); path traversal is impossible because only that exact key shape is accepted. Served with `nosniff`, a locked-down CSP and an immutable cache header. Deleted images return 404.
- Uploads are limited to 30 per person per hour and need permission to write articles. An image still used as an article's hero image cannot be deleted. Deleting removes the file and marks the record deleted. Uploads and deletions are audited.

### Verified
- **Run for real here:** 6 unit tests for the byte sniffer (PNG, JPEG with a skipped header segment, three WebP kinds, SVG/GIF/text/truncated rejected, size limits, path-traversal-proof storage) pass. Vitest is not installed in this sandbox, so they ran under a tiny stand-in runner; please re-run them with the real one (`npm run test:unit`).
- Syntax of every new/changed file parses.
- **Not run:** typecheck, `next build`, the 6 new integration tests in `tests/integration/media.test.ts`, any browser upload, or a real JPEG/PNG/WebP produced by an encoder (the unit-test images are hand-built headers).

### Limits (read before production)
- **No resizing, thumbnails, WebP/AVIF conversion or responsive `srcset`.** Images are served as uploaded (max 5 MB). Adding that needs an image library (e.g. `sharp`) that could not be installed here.
- **Storage is local disk** (`MEDIA_DIR`, default `./uploads`). It needs a persistent volume and is not suitable for serverless hosting or several servers; implement the 3-method `MediaStorage` interface for S3-compatible storage or Cloudinary. Neither is built.
- Files of unpublished articles are reachable by anyone who has the (random, unguessable) URL.
- Removing an image from an article leaves the file and record (an orphan) until it is deleted; there is no media library screen or orphan cleanup yet.
- The image is not scanned for malware and its metadata (EXIF, including GPS) is **not stripped**.
- Images inside the article body are still not supported; only the main image.

---

*History:*

## Stage 8 (part 2): homepage controls (v0.10.0)

Delivered: **`/admin/featured`**. Editors and admins choose and order the top-story carousel (up to 5) and the Featured Stories box (up to 3), and edit the promotional banner with a live preview. The public homepage already read these pins and the `homepage.promo` setting, so changes take effect on the next page load (the homepage is dynamic, nothing to invalidate).

- API: `GET /api/v1/admin/homepage`, `PUT /api/v1/admin/homepage/slots/{hero|featured}` (`{articleIds}` in display order), `PUT` / `DELETE /api/v1/admin/homepage/promo`. Pinning needs `featured:manage`; the banner needs `homepage:manage` (both editors and admins).
- Rules enforced on the server: only live published stories can be pinned; no duplicates; slot size limits; an article sits in one slot at a time (pinning it elsewhere moves it); banner links must be a site path or https; every change is audited.
- Preview: the slot lists show exactly the order readers will see and nothing is saved until "Save changes"; the banner preview renders the real banner component.

### Verified
- Syntax only (new files parse). **Not run:** typecheck, build, the 7 new tests in `tests/integration/homepage.test.ts`, any browser check. Same sandbox limits as part 1.

### Limits / decisions
- A story that is later archived or unpublished stays pinned but is skipped publicly; the admin list marks it "not live".
- Pin start/end dates exist in the database but have no UI yet.
- "Category order", "trending pins" and "homepage sections" from the brief are not built; category shortcuts on the homepage are still the fixed list in `config/navigation.ts`.
- The first save of a slot replaces it wholesale, so two editors saving at once means the last save wins (a unique-constraint clash is reported as a conflict).

---

*History:*

## Stage 8 (part 1): admin screens (v0.9.0)

Delivered: an admin shell with permission-aware navigation, a real **dashboard** (`/admin`, `GET /api/v1/admin/dashboard`), **users and roles** (`/admin/users`, including the "can publish directly" grant), **categories** (`/admin/categories`: add, hide/show, delete), **tags** (`/admin/tags`) and the **audit log** (`/admin/audit-logs`, filter by area). All of these sit on APIs and services that already existed and were already tested; the only new server code is the dashboard aggregation.

### Verified
- **Syntax only.** Every new or changed file parses with the TypeScript compiler (15 files, 0 errors).

### NOT verified (this build environment had no network, no PostgreSQL and no installed Next/Prisma/Vitest)
- `tsc --noEmit`, `next build`, the existing 200 tests, and the **new 6 integration tests** in `tests/integration/dashboard.test.ts` were **not run**. Run `npm install && npx prisma generate && npm run typecheck && npm run test:unit`, then the integration suite with `TEST_DATABASE_URL`, before trusting this stage.
- No browser check of the new screens (layout, 390 px overflow, keyboard order, contrast, screen-reader labels).
- Highest-risk lines: the filtered relation count in `getAdminDashboard` (`_count.select.articles.where`) and the `groupBy` calls, which follow patterns already used elsewhere but have not run against Prisma 6.19.

### Design decisions you may want to change
- The dashboard needs `analytics:view_all`, so editors see it too; the Users and Audit pages stay admin-only. Editors do not see subscriber or user management links.
- The dashboard shows **zero views** until view collection exists (analytics stage). It says so rather than inventing numbers.
- Date range on the dashboard is Today / 7 / 30 days; a custom range is not built yet.
- Audit filter is limited to a fixed list of area prefixes (article, category, tag, user, author, account).
- Changing a role and the publish grant are two API calls, so if the second fails the first stays applied (the form reports the error and refreshes).

### Still to do (not started)
Featured stories and homepage controls, comments moderation, newsletter, media upload (hero images), analytics collection and the trending score in use, full-text search endpoint, advertisements, site settings, e-mail verification, then the final security, performance and accessibility pass. `prisma migrate` is still unverified and no migration is committed.

---

*History (earlier stages):*

## Stage 7: reader features (v0.8.0)

Delivered: saved articles (bookmarks), private reading history, preferences (topics, privacy, notifications), a notifications page, and a profile page with change-password, sign-out-other-devices, data export and account deletion. The article page now has a Save button and records reads for signed-in readers.

### Verified (real PostgreSQL 16, production build)
- **200 / 200 automated tests** (79 without a database); `tsc` clean; `next build` succeeds. New this stage: 16 reader, 11 account, 6 HTTP-layer integration tests.
- **44 / 44 real-browser checks** for the reader journey, plus the earlier **32 / 32** editorial and **20 / 20** account-page journeys re-run on this build (no regressions).
- Highlights proven in a browser: anonymous visitors are offered "Log in to save" and are sent back to the article after login; saving persists across reloads; a read is recorded only after a few seconds and only when recording is on; history can be cleared (with confirmation) or switched off; preferences persist; unread counts in the header follow mark-read / mark-all-read; changing the password signs out a second signed-in device but not the current one; the exported JSON downloads and holds no secrets; a deleted account cannot sign in; no horizontal overflow at 390 px on every new screen.

### Bugs found by this verification and fixed
1. Article **tag order was not deterministic** (the join table keeps no order); tags are now returned sorted by name.
2. The editor left a **stray empty paragraph** at the end of saved articles; the server now strips empty paragraphs (keeping a paragraph that only holds an image).
3. The destructive "Delete account" button looked like a normal primary button; it is now a clear red.
4. The share row's divider lines stopped short once a Save button was added.

### Design decisions you may want to change
- **Deleting an account keeps the articles the person wrote**, credited to "Deleted user" (the newsroom's record and published links stay intact). If you must erase authorship too, that is a policy change in `account/service.ts`.
- **A bookmark also records one "engagement"** per person per article (`ArticleEngagement`, type BOOKMARK) so the Stage 9 trending score can use real saves. It is removed when the bookmark is.
- Limits: 500 saved articles and 500 history entries per person.
- Muting newsroom notifications never mutes security alerts.
- Because the join table has no order, tags display alphabetically rather than in the order the author typed them.

### Not verified / known limitations
- **Interests are stored and editable but not used yet**: there is no "For you" feed. The data is ready for it.
- **E-mail address cannot be changed** (it needs a verification flow, together with e-mail verification at registration).
- Reading history is recorded by the browser after ~5 s on the page, so it does not count readers with JavaScript off, and it records nothing for an article the person opened for less than that.
- Screen-reader/keyboard behaviour of the new screens and measured colour contrast were not tested. Chromium only.
- `prisma migrate` is still unverified (no migration committed). The only schema change this stage is one nullable column, `User.preferences`; the generated migration will include it.
- Notification links: only "published" notifications link to a page. Others show text only.

### Next
Admin screens (users and roles, categories, tags, featured stories and homepage controls, audit log), then media upload (hero images), newsletter, analytics and trending, full-text search, and the final security, performance and accessibility pass.

---

*History (earlier stages):*

## Stage 6 (UI): editorial screens (v0.7.0)

Delivered: author dashboard, article list, rich-text editor, workflow panel with timezone-aware schedule picker, review and revision history with diff, editor review queue, live header notifications. Together with the previous Stage 6 backend this completes the editorial system.

### Verified (real PostgreSQL 16, production build)
- **166 / 166 automated tests** (79 without a database); `tsc` clean; `next build` succeeds.
- **32 / 32 real-browser checks** for the editorial journey and **20 / 20** for the account pages (Chromium): author writes with formatting, hits validation, saves, submits; editor sees the notification and queue, is refused a too-short reason, requests changes; author sees the feedback, revises, resubmits; editor approves, schedules for 09:30 in Asia/Kolkata (preview shows the exact UTC instant), cancels, publishes; the story is public with its formatting and the author's notification links to it; revision diff highlights the author's additions; a stale save is refused with a clear message and overwrites nothing; no horizontal overflow at 390 px on all four editorial screens.
- A consistency test runs **576 combinations** (8 kinds of caller × 8 statuses × 9 actions) and proves the UI shows exactly the actions the server allows.

### Bugs found by this verification and fixed
1. **Missing articles, categories and authors returned HTTP 200** instead of 404 (a Stage 4 flaw: the shared loading skeleton made Next send the page before "not found" was decided). Skeletons are now only on pages that cannot be "not found"; protected pages return a real 307 redirect. Verified with curl.
2. **The timezone list had no "Asia/Kolkata"** (Chromium reports the legacy name "Asia/Calcutta"). Old names are now mapped to the modern ones and common zones are listed first.
3. **A race after saving** reset the editor's version number to a stale value, so a quick second save would have hit a false version conflict.
4. **Toolbar clicks lost the next keystroke** (focus moved to the button). Fixed by keeping focus in the editor.
5. A freshly opened article claimed it had **unsaved changes** (and would have shown a "leave page?" warning).
6. After the first save, the "saved" confirmation disappeared because the page changes; the edit page now shows "Draft saved."

### Not verified / known limitations
- Screen-reader behaviour and keyboard order of the editor, toolbar and panels were not tested; axe or a manual audit is still needed. Colour contrast of the new badges was not measured.
- Pages for signed-in users without a role show a "no access" screen with HTTP 200 (the APIs return 403 correctly).
- `prisma migrate` is still unverified (see earlier sections); no migration is committed.
- The editor supports text formatting and links only: **no images inside articles and no hero-image upload yet** (the data model supports a hero image; upload is in the media stage).
- Revision diff compares text only (not formatting) and refuses very long articles (over ~6,000 words).
- The editor was tested in Chromium only (not Firefox or Safari).
- The `e2e/` scripts use Playwright for Python; they are not yet wired into CI.

### Next
Reader features (bookmarks, history, preferences, notification page), then admin screens (users, categories, tags, featured stories, audit log UI), media upload, newsletter, analytics collection, search.

---

*History (earlier stages):*

## Stage 6: Editorial workflow backend (v0.6.0)

Scope delivered: the full publishing workflow over the API, revision and review history, notifications, timezone-aware scheduling with a background publisher. **The editor/author screens are not built yet** (see "Not implemented").

### Verified (real PostgreSQL 16)
- **153 / 153 automated tests pass**: 66 unit + 87 integration (new this stage: 11 unit, 18 editorial service, 5 editorial HTTP). `tsc --noEmit` clean. Clean-extraction run of the ZIP: see the final line of this section.
- Real production server, driven with curl: submit → premature approve refused (422) → review → author's approve attempt refused (403) → approve → hidden publicly (404) → admin schedules for +61 s → cron too early publishes nothing → cron without secret 401 → **after the real wait, cron publishes it** → public API 200 and `/news/<slug>` 200 → second cron run publishes nothing.
- Real browser: the header bell shows "Notifications, 2 unread" for the author and "1 unread" for the editor, lists the real titles, and the published item links to the live story.
- Concurrency: simultaneous approve vs request-changes → one winner; three scheduler workers at once → every article published exactly once with one notification each.
- Failure handling: transient DB errors retried (succeeds on 3rd attempt); inactive category → article returns to APPROVED, `SCHEDULE_FAILED` sent to author and all editors/admins, no retry loop.
- Time zones: Asia/Kolkata, Tokyo, New York and London around DST, DST gap rejected, fall-back ambiguity handled (unit tests).

### Design decisions you may want to change
- **Rejection archives the article** (IN_REVIEW → ARCHIVED with a REJECTED review). There is no separate REJECTED status in your spec, so I added that one transition.
- **Editors cannot review their own articles** (administrators can). Remove the check in `editorial/service.ts` if your newsroom allows self-review.
- **Editing an approved or scheduled article sends it back to review.** This guarantees that what is published is what was approved.
- Scheduled articles are published by an **external trigger** (cron endpoint or `npm run job:publish-scheduled`). The app has no in-process timer, so it works on serverless hosting, but nothing publishes until you set up the trigger.

### Written but NOT verified
- `prisma migrate` (still blocked in the sandbox; no migration is committed): run `npx prisma migrate dev --name init`.
- Behaviour behind connection poolers (PgBouncer, Neon, Supabase). The scheduler uses `SELECT ... FOR UPDATE SKIP LOCKED` inside a transaction, which needs transaction-mode-compatible pooling.
- `next build` shows a benign `jose` warning (details in security.md).
- The CLI script `npm run job:publish-scheduled` ran against an empty queue only (it printed `{"published":[],...}`); its publish path is the same function the tests exercise.
- Accessibility of the notification panel, dependency audit, real e-mail delivery.

### Not implemented (next)
- **Stage 6 screens:** author dashboard, rich-text editor, editor review queue, schedule picker, revision diff. The API for all of them exists.
- E-mail notifications and notification preferences (in-app only today).
- Notification links for editorial events (no pages to link to yet; only "published" links to the story).
- Email verification, change-password, comments, bookmarks, reading history, newsletter, analytics collection, media upload, full-text search, homepage/featured controls, CSP, Redis rate limiter, cache revalidation.

---

*History (earlier stages):*

## Stage 5: Backend foundation + accounts (v0.5.0)

Scope: authentication, sessions, RBAC, users/roles admin, articles (draft CRUD), categories, tags, audit log, auth pages.

### Verified (all run in the build sandbox against a real PostgreSQL 16 server)
- **119 / 119 automated tests pass** (`vitest run`): 55 unit tests + 64 integration tests (8 content repository, 16 auth, 9 articles, 11 categories/tags/users/audit, 20 HTTP layer incl. middleware).
- `tsc --noEmit` clean under strict mode, against the **real generated Prisma client**.
- `next build` succeeds (34 routes, middleware 39 kB). The production server (`next start`) was exercised with curl and a headless Chromium: security headers, CSRF block, register/login/logout, silent refresh (307 -> 303 -> 200, rotated cookies, no loop), brute-force limit (8x 401 then 429), error envelopes.
- **20 / 20 real-browser checks** (Playwright + Chromium): register/login/logout through the UI, validation messages, header state, HttpOnly cookies unreadable by JS, `?next=` handling and open-redirect refusal, forgot/reset pages, no horizontal overflow at 360/390/768 px, no JS errors.
- Items that were "written, not verified" in Stage 4 are now verified: `prisma-repository.ts` (all queries, against real data), `prisma/seed.ts` (ran: 4 users, 12 categories, 50 role-permission links), typecheck, `next build`, real Vitest.

### Bugs found by this verification and fixed
1. Edge middleware imported a module using `node:crypto` -> `next build` failed. Split into `auth/jwt.ts` (edge-safe) and `auth/tokens.ts`.
2. The path-scoped refresh cookie is never sent on page navigations, so silent refresh could not trigger. Added a non-secret `enews_sh` hint cookie (Path=/); the refresh token stays scoped to `/api/v1/auth`. Tests now use a path-aware cookie jar so this class of bug cannot hide.
3. `pg_advisory_xact_lock` returns `void`, which Prisma cannot deserialize: role changes always failed. Cast to text.
4. Header logout (plain form post) returned an empty 204; it now redirects home for browsers.

### Written but NOT verified
- **`prisma migrate`**: the sandbox cannot download Prisma's schema engine. No `prisma/migrations` folder is committed; run `npx prisma migrate dev --name init` once. For the sandbox tests the tables were created from Prisma's own parsed data model by a throwaway script (not shipped), so the exact SQL Prisma will generate is unverified. Test with `prisma migrate dev` + `npm run test:integration` on your machine.
- Prisma runs with `engineType = "client"` and the `pg` adapter (no native query engine). This is what was tested here; behaviour against managed Postgres poolers (PgBouncer, Neon, Supabase) is untested.
- Screen-reader behaviour, keyboard order and measured colour contrast of the new auth pages.
- `npm audit` / dependency vulnerabilities.
- Real email delivery (only a console/memory mailer exists).

### Not implemented yet
- Editorial workflow endpoints (submit, review, request changes, approve, publish, schedule, archive) and the author/editor UI: **Stage 6**. `lib/workflow.ts` rules exist and are tested, but nothing calls them over HTTP yet.
- Email verification at registration, change-password, account export/delete, MFA.
- Bookmarks, reading history, comments, notifications API, newsletter API, analytics collection, media upload, full-text search, admin UI pages, CSP header, Redis-backed rate limiter.

### Design decisions worth reviewing
- Roles come from the database on every authenticated request (one extra query) so demotions take effect immediately.
- Non-owners get 404 (not 403) for other people's articles to avoid revealing their existence.
- Authors may introduce new tags through articles; tag renaming/deleting is editor/admin only.
- Slugs never change after creation (stable URLs).

---

*History (earlier stages; statements below were true at the time):*

## Stage 4: Public pages and content access (v0.4.0)

### Verified
- All 19 route renders (home, news pages 1/2/out-of-range, article with and without table of contents, category, unknown category, search with results / none / empty / too short, trending, most read, author, about, contact, privacy, newsletter, not-found) rendered server-side through the real page and layout components against an in-memory repository, with no exceptions. Unknown slug correctly raised `notFound()`.
- In headless Chromium: no horizontal overflow at 360, 390, 768 and 1280px on any route, and exactly one `<h1>` per page (found and fixed: article overflow at 360/390px, duplicate h1 on the homepage, missing h1 on not-found pages, article body column width).
- 13 new unit tests (trending score, heading ids / table of contents, search input handling, JSON-LD escaping, pagination window) and 3 format tests pass, and the 9 Stage 2 workflow tests still pass. These were run with a minimal stand-in for Vitest, not Vitest itself.
- Article `generateMetadata` returns the canonical URL and `article` Open Graph type.

### Written, NOT verified
- `src/lib/content/prisma-repository.ts` (all queries): the Prisma client cannot be generated here, so none of it has run against a database or been type-checked. Treat it as the highest-risk file in this ZIP.
- `next build` / `next dev`, `npm run typecheck`, and real Vitest (`npm test`): no network in the build sandbox.
- Stage 2 `tests/lib.test.ts` could not be run here (needs `next/server`).
- `sitemap.ts` and `robots.ts` output, the share links, copy-link button and reading progress bar behaviour in a real browser (rendered statically; hydration of these was not exercised).
- Keyboard order, screen-reader behaviour and colour contrast: reasoned, not measured.

### Not implemented
See "Not done in this stage" in `docs/public-pages.md` (comments, bookmarks, real auth, view tracking, RSS, full-text search, timezone-aware dates).

Earlier stages are summarised below.

## Stage 3: Design system, header, hero, shared components (v0.3.0)

### Verified (rendered in headless Chromium with a bundled harness, not via `next build`)
- No horizontal overflow at 360, 390, 768, 1024, 1280, 1920px
- Hero carousel next/previous, mobile menu open/Escape-close, notification popover and account menu (outside-click and Escape close), newsletter client-side validation (invalid email, missing consent), desktop nav and active indicator: all behaved as expected
- No page or console errors during those runs
- Format helper assertions (9) pass when run directly with tsx. The Vitest file `tests/format.test.ts` was written but **not run** (vitest is not installed in the build sandbox)

### Written, NOT verified
- `next build` / `next dev`, `npm run typecheck` against real `@types/react` and Next types: the sandbox has no network, so the UI was only type-checked against loose stubs (remaining errors were stub artefacts)
- Newsletter submit against a real endpoint (the API does not exist yet)
- Screen-reader behaviour, keyboard tab order, and colour contrast were reasoned about, not measured
- Comparison with the Dribbble screenshot (never supplied)

### Not implemented in this stage
- Real homepage data (the `/` route shows an empty state until Stage 5-6 APIs exist)
- Pages beyond `/` and the dev gallery `/design-system`; article detail, category, search, auth
- Animations beyond CSS transitions; real imagery; dark mode

Earlier stages are summarised below.

## Stage 1-2: Architecture, database, API conventions (this ZIP, v0.2.0)

### Fully implemented AND verified
- Workflow state machine with role checks, explicit author publish grant, version checks (`src/lib/workflow.ts`): 9 unit tests passing
- Permission matrix (`src/lib/permissions.ts`), slug, reading time, pagination, env validation, error envelope (no internal leaks): 8 unit tests passing
- Total: **17 / 17 unit tests passing** (Vitest)

### Implemented, NOT yet verified
- `prisma/schema.prisma` (25 models): could not run `prisma validate`/`generate` in the build sandbox (no access to binaries.prisma.sh). **Run `npx prisma validate` first on your machine.**
- `prisma/seed.ts`: written, never executed (needs generated client and a database). It also has 3 type errors until `prisma generate` runs; they are expected and disappear after generation.
- Security headers in `next.config.mjs`, `GET /api/v1/health`: written, `next build` not run
- `docker-compose.yml`: not run

### Not implemented yet (later stages)
- Raw SQL migration for the full-text-search GIN index (add after first `migrate dev`)
- UI and design system (Stage 3-4), auth (Stage 5), editorial endpoints (Stage 6), everything after
- Playwright, integration tests

### Known risks / assumptions
- Screenshot reference has not been provided; Stage 3 depends on it.
- `package.json#prisma` seed config is deprecated in Prisma 7; migrate to `prisma.config.ts` when upgrading.
