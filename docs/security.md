# Security notes (Stage 5)

## Implemented and covered by automated tests
| Control | Where | Evidence |
|---|---|---|
| Argon2id password hashing (19 MiB, t=2, p=1), 10-128 char policy, small common-password blocklist | `server/auth/password.ts` | unit + DB test checks the stored hash is `$argon2id$` |
| Uniform login failure + dummy hash to equalise timing | `auth/service.ts` | wrong password vs unknown email return identical status/code/message |
| Short-lived access JWT (HS256, 15 min, iss/aud checked, `alg=none` rejected) | `auth/jwt.ts` | unit tests: tamper, expiry, wrong secret, unsigned token |
| Rotating opaque refresh tokens, only SHA-256 stored, reuse detection revokes the session + security notification, 10 s grace for two tabs, absolute 90-day cap | `auth/service.ts` | integration tests incl. concurrent refresh (one winner) |
| Roles read from the database on every request (role changes apply immediately; revoked/expired sessions and deleted users rejected) | `auth/guard.ts` | integration tests |
| HttpOnly + SameSite=Lax cookies, Secure when `APP_URL` is https; refresh token scoped to `/api/v1/auth` | `auth/cookies.ts` | unit + browser test (JS cannot read tokens) |
| CSRF: same-origin check on every state-changing request | `security/csrf.ts` | unit + HTTP tests (cross-origin and origin-less blocked) |
| Rate limiting (register, login per IP and per email, forgot-password) | `security/rate-limit.ts` | 8th failed login ok, 9th = 429 (also seen against the real server) |
| Account recovery: single-use 1 h token, old links invalidated, all sessions revoked, no account enumeration, mail failure never leaks | `auth/service.ts` | integration tests |
| Open-redirect protection for `next` | `auth/http.ts` | unit + browser tests |
| Server-side authorization: permission matrix + ownership checks; non-owners get 404 (IDOR) | `articles/policy.ts` | unit + integration + HTTP tests |
| Optimistic concurrency (compare-and-set on `version`) | `articles/service.ts` | two simultaneous saves: exactly one wins |
| HTML allow-list sanitizer (no script/iframe/style/handlers/javascript:/data:/http images) | `content/sanitize.ts` | unit tests |
| Safe errors: unknown errors logged server-side only, generic body + requestId | `lib/api/response.ts` | unit test |
| Request size caps (64 KB, 300 KB for articles), pagination caps | `lib/api/request.ts` | unit + HTTP tests |
| Security headers (nosniff, frame DENY, HSTS, referrer, permissions) | `next.config.mjs` | seen on the running production server |
| Audit log for auth events, content and role changes | `audit/audit.ts` | integration tests |

## Added in Stage 6
| Control | Evidence |
|---|---|
| Every editorial action re-checks visibility (404), permission (403), allowed transition (422), version (409) on the server, then applies an atomic compare-and-set on (status, version) | integration + HTTP tests; simultaneous decisions: exactly one wins |
| Separation of duties (no self-review except administrators) | integration test |
| Scheduler endpoint requires `Authorization: Bearer $CRON_SECRET` (constant-time comparison), disabled when unset, not cookie-authenticated | HTTP tests + real-server run |
| Notifications and "mark read" are strictly per-user (others' ids are ignored) | integration + HTTP tests |
| Feedback and revision history visible only to the article's author and staff | HTTP tests |

## Added in Stage 7
| Control | Evidence |
|---|---|
| Reader data is strictly per user: bookmarks, history, notifications, preferences (a stranger's attempt to remove or read yours changes nothing) | integration + HTTP tests |
| Password change requires the current password, is rate limited (5 / 15 min), signs out other devices, alerts the owner by notification and e-mail | integration + browser tests |
| Account deletion needs password + typed confirmation, is rate limited, erases email/name/sessions/bookmarks/history/notifications/searches, frees the address, leaves no personal data in the audit log, and never removes the last administrator | integration + browser tests |
| Data export is rate limited (3 / hour), served as a no-store attachment, and tested to contain no password, token or session hashes | integration + HTTP + browser tests |
| Security alerts cannot be muted; newsroom notifications can | integration test |
| Stored preferences are re-validated on read (damaged data falls back to defaults) | unit test |

## Added in Stage 11 (v0.12.0): views and newsletter
- Newsletter is double opt-in; only the SHA-256 of the confirmation token is stored; confirmation links expire after 7 days; consent text, time and a keyed hash of the IP are stored per subscriber.
- Confirmation and unsubscribe links open a page with a button (POST), so mail scanners that fetch links cannot change anyone's subscription.
- Unsubscribe uses an HMAC-signed, non-expiring token (constant-time comparison); knowing an address is not enough to unsubscribe it.
- Subscribe is rate limited per address (3/h) and per IP (10/h, only when `TRUST_PROXY=1` gives a real IP). A 409 for an already-active address does reveal that the address is subscribed (the brief asks for a duplicate message); this is the accepted trade-off.
- View collection stores only a keyed hash (HMAC) of the user id or anonymous cookie, never an IP or a raw id; honours `Sec-GPC` / `DNT`; the anonymous cookie is HttpOnly, SameSite=Lax and scoped to `/api/v1/analytics`.

## Known gaps and trade-offs (not yet addressed)
- **Rate limiter is in-process memory.** Correct for one instance; use a Redis-backed `RateLimiter` before scaling out.
- **Per-email login limit can be used to lock a victim out for 15 minutes** (an accepted trade-off against password guessing).
- **No email verification on registration yet** (`emailVerified` stays false), no e-mail change, no MFA.
- Deleted accounts keep their articles credited to "Deleted user"; draft or published articles are not deleted with the account.
- **Content-Security-Policy is not set yet.** Needs a nonce strategy with the Next.js inline scripts; planned for the hardening stage.
- Registration reveals whether an email exists (409). Login and password reset do not.
- `TRUST_PROXY=1` must only be set behind a proxy that overwrites `X-Forwarded-For`.
- `next build` prints a warning from `jose` (its unused encrypted-token code mentions `CompressionStream`). Tokens here are signed only and the middleware was verified on the running server, so it is benign.
- Dependency audit (`npm audit`) not run in the build sandbox.
- Real mail provider not wired: `ConsoleMailer` logs mail (never the body in production).


## Newsletter campaigns (Stage 15)
- **Consent:** recipients are frozen from `ACTIVE` (double opt-in confirmed) subscribers only, and status is re-checked per recipient at send time, so anyone who unsubscribed in between is skipped. Every mail has a footer link and `List-Unsubscribe` / `List-Unsubscribe-Post` (RFC 8058) headers carrying the signed, non-expiring token.
- **No injection through content:** editors write plain text; the server escapes it and only turns `https://` URLs into links. There is no HTML input, so no script, image or tracking pixel can be placed in a campaign. Subjects must be one line and header values with CR/LF are refused before reaching the provider.
- **Exactly-once-ish sending:** one `NewsletterDelivery` row per (campaign, subscriber) with a unique key; claim-before-send; crashed in-flight sends are marked FAILED ("outcome unknown") and never auto-retried, because a duplicate e-mail is worse than a missed one.
- **Blast-radius limits:** admins only (`newsletter:manage`); test sends go only to the caller's own address; the job stops after 5 consecutive failures; settings errors (bad key/sender) abort the run without marking recipients as failed or bounced; the console mailer is refused in production so a campaign can never be "sent" without delivering.
- **Secrets:** `RESEND_API_KEY` is read from the environment only; provider error bodies and the key never appear in error messages, the database or the admin screen.
- **Not covered:** provider webhooks (bounces, spam complaints) are not received, so a hard-bouncing address is not automatically suppressed.
