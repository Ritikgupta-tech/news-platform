# ASHIVAM TECHNOLOGIES E-NEWS — TEST EXECUTION REPORT

**Date:** November 16, 2026  
**Test Runner:** Vitest v2.1.9  
**TypeScript Compiler:** TypeScript 5.8 (via `tsc --noEmit`)  
**Lead:** QA Automation Lead & Senior Full-Stack Engineer  

---

## 1. Test Suite Summary

- **Total Test Files Evaluated:** 33 files
- **Active Unit & Workflow Suites:** 13 files
- **Total Tests Executed:** 128 tests
- **Tests Passed:** **128 passed (100% pass rate)**
- **Tests Failed:** **0 failed**
- **TypeScript Static Errors:** **0 errors**

---

## 2. Active Test Suite Breakdown

| Suite File | Tests | Status | Scope |
|---|---|---|---|
| `tests/stage5-unit.test.ts` | 23 | **PASSED** | Editorial workflow, article state transitions, validations |
| `tests/newsletter-unit.test.ts` | 14 | **PASSED** | Subscription, confirmation tokens, unsubscribe handlers |
| `tests/editorial-unit.test.ts` | 13 | **PASSED** | Timezone conversions, publication scheduling |
| `tests/stage4.test.ts` | 13 | **PASSED** | Content validation, slug uniqueness, tag constraints |
| `tests/editorial-ui-unit.test.ts` | 10 | **PASSED** | Article editing UI states, draft preservation |
| `tests/date-range.test.ts` | 16 | **PASSED** | Analytics date calculations, time interval grouping |
| `tests/workflow.test.ts` | 9 | **PASSED** | Editorial approval lifecycle (Draft -> Review -> Publish) |
| `tests/lib.test.ts` | 8 | **PASSED** | ApiError envelope, sanitization, secret masking |
| `tests/media-unit.test.ts` | 6 | **PASSED** | Image dimensions, MIME type validation, blurhash extraction |
| `tests/stage16-unit.test.ts` | 5 | **PASSED** | Audit logging formatting and action parsing |
| `tests/stage12-unit.test.ts` | 4 | **PASSED** | Breaking news dispatch and priority ordering |
| `tests/stage11-unit.test.ts` | 4 | **PASSED** | Live blog update feeds and timestamp ordering |
| `tests/format.test.ts` | 3 | **PASSED** | Currency, reading time, and date formatting |

---

## 3. Integration Test Safety Verification

The repository contains 20 database integration test files (188 tests) configured to run exclusively against an ephemeral test database (`TEST_DB_URL`). When running in non-test or production environments without `TEST_DB_URL`, these integration suites are intentionally skipped to safeguard production databases from unintended truncations or record mutations.

---

## 4. Live Production API Automated Tests

The following live automated integration checks were executed directly against the live Vercel production deployment (`https://news-platform-kappa.vercel.app`):

1. **`GET /api/v1/health`**
   - Status: `200 OK`
   - Payload: `{"data":{"status":"ok","time":"..."}}`
2. **`POST /api/v1/auth/login` (Standard Browser Headers)**
   - Status: `200 OK`
   - Response: `{"data":{"user":{"id":"...","email":"admin@ashivam.com","roles":["ADMIN","EDITOR","AUTHOR"]}}}`
   - Headers: `enews_at`, `enews_rt`, `enews_sh` cookies properly issued.
3. **`POST /api/v1/auth/login` (Sec-Fetch-Site: same-origin)**
   - Status: `200 OK`
4. **`POST /api/v1/auth/login` (Cross-Site Origin: malicious-site.com)**
   - Status: `403 Forbidden` (`Cross-site request blocked`)
