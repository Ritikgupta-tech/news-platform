# E News — Premium Digital News & Publishing Platform

A modern, production-grade digital news and editorial publishing platform inspired by premium digital publications. Features a comprehensive editorial CMS, multi-role publishing workflow, full-text search with instant suggestions, newsletter campaign engine with delivery tracking, advertising management, live reader analytics, bookmarks, reading history, and administrative governance.

---

## Architecture & Technology Stack

- **Framework**: Next.js 15 (App Router, React 19, TypeScript strict mode)
- **Database & ORM**: PostgreSQL with Prisma ORM (`engineType = "client"`, `@prisma/adapter-pg`)
- **Authentication & Security**: Argon2id password hashing, rotating JWT access & refresh tokens in HTTP-only cookies, OWASP ASVS compliance, rate limiting, and server-side RBAC
- **Rich Text Editorial**: TipTap Headless Editor with HTML sanitization on write
- **Full-Text Search**: PostgreSQL `websearch_to_tsquery` ranking with GIN index and debounced live suggestion dropdown
- **Delivery & Mail**: Multi-adapter mailer (`console` for dev, `resend` for production delivery), List-Unsubscribe headers, double opt-in verification
- **Deployment Targets**: Vercel Serverless, Render Web Service & Database Blueprint (`render.yaml`), Docker containerization (`Dockerfile`)
- **Testing**: Vitest (128 unit tests passing), Python Playwright E2E suites

---

## Core Features & Capabilities

### 1. Public Reader Experience
- **Dribbble-Inspired Design**: Clean typography (Source Serif 4 + Inter), editorial grid, soft blue accents, restrained shadows, responsive navigation with sticky header.
- **Hero Carousel**: Breaking news badges, high-resolution imagery, smooth carousel controls, dynamic headlines from the backend.
- **Category Shortcuts & Feeds**: World, India, Politics, Business, Technology, Science, Health, Sports, Entertainment, Lifestyle, Education, Environment.
- **Article Reading Experience**:
  - Reading progress bar, category breadcrumbs, reading time estimate, photo credits.
  - Social sharing, one-click bookmarking, table of contents for long reads.
  - Reader comments with reporting and moderation.
  - **Article Reporting**: Direct flag dialog for misinformation, copyright, or harm.
  - Adjacent prev/next navigation and related articles.
  - NewsArticle & Breadcrumb Schema.org JSON-LD structured data and OpenGraph metadata.
- **Discovery**: Full-text search with instant debounced suggestions in the navbar, RSS 2.0 feed (`/feed.xml`), and dynamic XML sitemap.

### 2. Reader Accounts & Personalization
- Registration with secure password hashing and verification.
- Bookmarks dashboard (`/bookmarks`) and automatic reading history tracking (`/reading-history`).
- Reader preferences (`/preferences`) for email newsletters and notifications.
- Complete GDPR-compliant data export and account self-deletion.

### 3. Multi-Role Editorial CMS Workflow
- **Roles**: Visitor, Registered Reader, Author / Journalist, Editor, Administrator.
- **Explicit Lifecycle**: `DRAFT` → `SUBMITTED` → `IN_REVIEW` → `CHANGES_REQUESTED` → `APPROVED` → `SCHEDULED` → `PUBLISHED` → `ARCHIVED`.
- Optimistic concurrency control (`version` checks) to prevent overwrite conflicts.
- TipTap rich text authoring with sanitization, metadata, categories, tags, and media management.
- Author Dashboard (`/author/dashboard`) with article metrics, revision histories, and review notes.
- Editor Review Queue (`/admin/articles?scope=review`) with approve/request-changes workflow.
- Scheduled publishing engine with idempotency (`npm run job:publish-scheduled`).

### 4. Administration & Governance
- **Dashboard (`/admin`)**: Real-time KPI stats (articles, readers, views, subscribers, top content).
- **Advertisements (`/admin/advertisements`)**: Manage promotional banners across hero, sidebar, and home slots.
- **Site Settings (`/admin/settings`)**: Configure platform identity, registration access, peer-review enforcement, and comments.
- **Newsletter Campaigns (`/admin/newsletters/campaigns`)**: Draft, test, schedule, and track campaign deliveries.
- **Moderation (`/admin/comments`)**: Review reported community comments with hide/restore controls.
- **User Management (`/admin/users`)**: Manage roles, author direct-publishing privileges, and audit logs.
- **Audit Logging (`/admin/audit-logs`)**: Complete immutable audit trail of publishing, security, and administrative actions.

---

## Quick Start

### 1. Prerequisites
- Node.js 20+ (Node 22 recommended)
- PostgreSQL 15+ (or Docker Compose)

### 2. Environment Setup
```bash
cp .env.example .env
```
Generate secrets:
```bash
node -e "console.log('JWT_ACCESS_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log('CRON_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Database & Dependencies
```bash
# Start PostgreSQL and Redis via Docker (optional if local PG is running)
docker compose up -d

# Install packages
npm install

# Generate Prisma Client & Run Initial Migration
npm run db:generate
npm run db:deploy

# Seed reference data and development accounts
SEED_DEV_PASSWORD="password12345" npm run db:seed
```

Default development accounts (password: `password12345`):
- **Admin**: `admin@example.test`
- **Editor**: `editor@example.test`
- **Author**: `author@example.test`
- **Reader**: `reader@example.test`

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Testing & Quality Assurance

```bash
# Run unit tests (128 assertions across 13 test suites)
npm run test:unit

# Run TypeScript strict typecheck
npm run typecheck

# Run production build
npm run build
```

---

## Production Deployment

### Deploying to Vercel
1. Push repository to GitHub: `https://github.com/Ritikgupta-tech/news-platform.git`
2. Import project in Vercel. Preset is automatically detected via `vercel.json`.
3. Add a PostgreSQL database (e.g. Neon, Supabase, or Vercel Postgres) and set `DATABASE_URL`.
4. Configure environment variables (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CRON_SECRET`, `APP_URL`).
5. Deploy.

### Deploying to Render
1. In Render, select **"Blueprints"** -> **"New Blueprint Instance"**.
2. Connect `https://github.com/Ritikgupta-tech/news-platform.git`.
3. Render automatically provisions the web service, database, and persistent upload disk using `render.yaml`.

For detailed deployment steps, see [docs/deployment.md](docs/deployment.md).

---

## Repository & Links

- **GitHub Repository**: [https://github.com/Ritikgupta-tech/news-platform.git](https://github.com/Ritikgupta-tech/news-platform.git)
- **Documentation**:
  - [Architecture Overview](docs/architecture.md)
  - [Deployment Guide](docs/deployment.md)
  - [Security Architecture](docs/security.md)
  - [Editorial Workflow](docs/business-workflow.md)
  - [Database Design](docs/database-design.md)
  - [API Contracts](docs/api.md)
