# ASHIVAM TECHNOLOGIES E-NEWS — DEPLOYMENT READINESS REPORT

**Date:** November 16, 2026  
**Target Environment:** Production (Vercel + Neon PostgreSQL)  
**Host URL:** [https://news-platform-kappa.vercel.app](https://news-platform-kappa.vercel.app)  
**Lead:** DevOps & Site Reliability Engineer  

---

## 1. Deployment Topology & Infrastructure

- **Frontend & Edge Routing:** Vercel Global Edge Network (IAD1 primary build region).
- **Backend Runtime:** Next.js 15.5 Serverless Functions (Node.js 22 runtime).
- **Database:** Neon PostgreSQL Serverless (AWS us-east-2) with PgBouncer connection pooling.
- **Git Continuous Deployment:** Configured with GitHub repository remotes:
  - `origin`: `https://github.com/Ritikgupta-tech/news-platform.git`
  - `company`: `https://github.com/AshivamTechnologies/e-news.git`

---

## 2. Environment Variables & Secrets Configuration

| Variable Name | Environment | Required | Description |
|---|---|---|---|
| `DATABASE_URL` | Production & Preview | **Yes** | Neon pooled PostgreSQL connection string with `sslmode=require` |
| `DIRECT_URL` | Production & Preview | **Yes** | Direct Neon PostgreSQL connection string for Prisma schema migrations |
| `JWT_SECRET` | Production & Preview | **Yes** | High-entropy secret for HMAC-SHA256 access token signing |
| `COOKIE_SECRET` | Production & Preview | **Yes** | High-entropy secret for signing cookie identifiers |
| `APP_URL` | Production & Preview | Optional | Base URL (System dynamically resolves `x-forwarded-host` fallback) |
| `ADMIN_PASSWORD` | Secure Manual / Env | **Yes** | Rotated 32-character CSPRNG secret for administrative provisioning |

---

## 3. Rollback & Disaster Recovery Procedures

1. **Instant Vercel Instant Rollback:**
   - In the event of an unexpected regression, any previous deployment can be instantaneously re-aliased to production via the Vercel dashboard or CLI (`vercel rollback`).
2. **Database Point-In-Time Restore (PITR):**
   - Neon provides native instant point-in-time recovery and branch cloning, allowing restoration to any second within the retention window without downtime.
3. **Audit Ledger:**
   - The database maintains an immutable `AuditLog` table capturing all administrative logins, content status changes, and user updates.
