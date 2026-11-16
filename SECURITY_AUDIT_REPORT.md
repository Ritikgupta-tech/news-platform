# ASHIVAM TECHNOLOGIES E-NEWS — SECURITY AUDIT REPORT

**Date:** November 16, 2026  
**Security Classification:** Highly Confidential / Production Audit  
**Auditor:** Application Security Lead & Principal Software Architect  
**Scope:** Full-stack security evaluation covering Authentication, Authorization, Session Management, CSRF, CSP, Data Protection, and Credential Handling.

---

## 1. Security Architecture & Threat Model

### 1.1 Authentication Mechanism
- **Algorithm:** Argon2id (RFC 9106 compliant).
- **Parameters:**
  - Memory Cost: 19,456 KiB
  - Time Cost: 2 iterations
  - Parallelism: 1 thread
- **Credential Storage:** `passwordHash` stored in Neon PostgreSQL database with unique cryptographic salt per user.
- **Protection Against Rainbow Tables & GPU Cracking:** Argon2id provides state-of-the-art resistance against hardware-accelerated dictionary and brute-force attacks.

### 1.2 Session Management & Token Rotation
- **Access Token (`enews_at`):**
  - Signed using HMAC-SHA256 (`HS256`) with `JWT_SECRET`.
  - Expiration: 900 seconds (15 minutes).
  - Flags: `HttpOnly`, `SameSite=Lax`, `Secure`, `Path=/`.
  - Inaccessible via client-side JavaScript (`document.cookie`), preventing token exfiltration via XSS.
- **Refresh Token (`enews_rt`):**
  - Cryptographically random 256-bit token stored in database as a SHA-256 hash.
  - Expiration: 30 days.
  - Flags: `HttpOnly`, `SameSite=Lax`, `Secure`, `Path=/api/v1/auth`.
  - Restricted to the auth endpoint path, preventing leakage across regular API routes.
- **Session Revocation:**
  - Instant session invalidation supported via database deletion.
  - Successfully executed session revocation across all legacy admin tokens.

---

## 2. Cross-Site Request Forgery (CSRF) Hardening

### 2.1 The Vulnerability (Remediated)
Previously, the CSRF middleware (`assertSameOrigin`) strictly compared incoming request origins against a static environment variable `APP_URL`, which defaulted to `http://localhost:3000`. On production deployments (`https://news-platform-kappa.vercel.app`), this caused false-positive 403 blocks with the error `Cross-site request blocked`.

### 2.2 The Remediation
The updated implementation in `src/server/security/csrf.ts`:
1. Safely bypasses non-mutating HTTP methods (`GET`, `HEAD`, `OPTIONS`).
2. Checks standard browser metadata header `Sec-Fetch-Site`. If explicitly `cross-site`, the request is immediately terminated with 403 Forbidden.
3. Automatically derives allowed origins from:
   - Configured `APP_URL`
   - Request URL origin (`new URL(req.url).origin`)
   - `x-forwarded-host` and `host` headers
4. Rejects null origins and unverified external origins.

### 2.3 Live Production Verification Evidence
```bash
# Test 1: Standard Browser Origin (news-platform-kappa.vercel.app)
Status: 200 OK (Authenticated)

# Test 2: Sec-Fetch-Site: same-origin
Status: 200 OK (Authenticated)

# Test 3: Cross-Site Attack (Origin: https://malicious-site.com)
Status: 403 Forbidden (Blocked)
```

---

## 3. Content-Security-Policy & Security Headers

The following security headers are enforced in `next.config.mjs` on every HTTP response:

```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https: blob:; connect-src 'self' https: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';
Cross-Origin-Opener-Policy: same-origin
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

---

## 4. Role-Based Access Control (RBAC) Audit

| Role | Reading / Public | Authoring / Drafts | Editorial / Publishing | System Administration |
|---|---|---|---|---|
| **Anonymous** | Read published articles, subscribe to newsletter | None | None | None |
| **Reader** | Bookmarks, reading history, comment submission | None | None | None |
| **AUTHOR** | Reader permissions | Create, edit owned drafts, upload media | None | None |
| **EDITOR** | Author permissions | Review, approve, reject, schedule, edit all articles | None | None |
| **ADMIN** | Editor permissions | Full platform configuration, user roles, audit logs, breaking news, newsletter broadcasts | Full access | Full access |

Every admin endpoint under `/api/v1/admin/*` enforces `requireRole("ADMIN")` or specific granular permissions. Unauthenticated or unauthorized callers receive 401 or 403 errors with masked internal details.

---

## 5. Security Recommendations for Continued Operations

1. **Vercel Secret Rotation:** Add `ADMIN_PASSWORD` directly into Vercel Dashboard Environment Variables for automated administrative scripts.
2. **Audit Log Monitoring:** Periodically review `/admin/audit-logs` for abnormal login frequency or bulk status changes.
3. **Session Lifetimes:** Keep access token lifetime at 15 minutes to limit exposure windows.
