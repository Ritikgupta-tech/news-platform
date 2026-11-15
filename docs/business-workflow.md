# Editorial workflow

```
DRAFT -> SUBMITTED -> IN_REVIEW -> APPROVED -> PUBLISHED -> ARCHIVED
                          |            |  ^
                          |            v  |
                          |        SCHEDULED
                          +-> CHANGES_REQUESTED -> (author edits) -> SUBMITTED
                          +-> ARCHIVED   (rejection)
```
The rules live in one place, `src/lib/workflow.ts`, and are enforced on the server in `src/server/editorial/service.ts`.

| Action | From → To | Who |
|---|---|---|
| submit | DRAFT / CHANGES_REQUESTED → SUBMITTED | the author, editors, admins |
| start-review | SUBMITTED → IN_REVIEW | editors, admins |
| request-changes | IN_REVIEW → CHANGES_REQUESTED | editors, admins (reason required) |
| approve | IN_REVIEW → APPROVED | editors, admins |
| reject | IN_REVIEW → ARCHIVED | editors, admins (reason required) |
| publish | APPROVED / SCHEDULED → PUBLISHED | editors, admins; an author with the explicit grant may publish their own DRAFT |
| schedule / cancel-schedule | APPROVED → SCHEDULED / back | editors, admins |
| archive | PUBLISHED → ARCHIVED | editors, admins |

## Rules that matter
- **Separation of duties:** nobody reviews (start, approve, request changes, reject) their own article, except an administrator. An editor may still publish an article that someone else approved.
- **Decisions apply to a specific version.** Every action carries the `version` the person looked at; if someone saved in between, the action fails with 409 instead of silently acting on different text.
- **Editing invalidates approval.** Changing the content of an APPROVED or SCHEDULED article sends it back to IN_REVIEW (and clears the schedule). The audit log records `approvalReset`.
- **Who can edit when:** authors edit their own DRAFT and CHANGES_REQUESTED articles; editors edit any non-archived article; nobody edits ARCHIVED.
- **History is kept:** every save is an `ArticleRevision`; every decision is an `EditorialReview` with reason and reviewer; every action is an `AuditLog` row.
- **Notifications** are created in the same transaction as the change: submitted → editors/admins; changes requested / approved / rejected / published → the author. Actors are never notified about their own actions.

## Scheduling
- `schedule` takes an absolute instant with an offset (`2026-12-01T09:30:00+05:30`) or a wall-clock time plus an IANA timezone (`2026-12-01T09:30` + `Asia/Kolkata`). Times are stored in UTC. Wall-clock times that do not exist (the hour skipped when clocks go forward) are rejected; ambiguous ones (clocks go back) use the first occurrence.
- Allowed window: at least 1 minute and at most 1 year ahead.
- The publisher (`POST /api/v1/internal/jobs/publish-scheduled` or `npm run job:publish-scheduled`) must be triggered by an external scheduler, ideally every minute.
- **Idempotent and concurrency-safe:** rows are locked with `FOR UPDATE SKIP LOCKED` and re-checked, so overlapping runs publish each article once and send one notification.
- **Retries:** transient database errors are retried (3 attempts, increasing backoff). A permanent problem (e.g. the category was deactivated) returns the article to APPROVED, raises a `SCHEDULE_FAILED` notification to the author and all editors/admins, and writes an audit entry, so it cannot loop forever.
- `publishedAt` is stamped with the scheduled instant, not the moment the job happened to run.

## Screens (Stage 6 UI)
- `/author/dashboard`: counts, pending reviews, views, feedback from editors, top-performing articles (real analytics only).
- `/author/articles`: your articles with status filters. `/author/articles/new` and `/author/articles/{id}/edit`: the editor (rich text, tags, source attribution, save, submit).
- The edit page also carries the **workflow panel** (only the actions this person may take now), review history, and revision history with a word-level diff against the current version.
- `/admin/articles`: review queue and all articles (editors and administrators).
- Anonymous visitors are redirected to log in and brought back; signed-in users without the role see a "no access" state. A test proves the buttons shown are exactly the actions the server allows, for every role and status.
- Saving while someone else saved first shows a conflict message and never overwrites their work.

## Not built yet
Notification preferences and e-mail notifications, homepage/featured-story controls, media upload (hero images), cache revalidation (public pages are rendered on demand today), image support inside articles.
