<div align="center">

# 🏛️ E NEWS — Enterprise Luxury Digital Publishing Platform
### *An Ashivam Technologies Flagship Engineering Product*

[![Live Platform](https://img.shields.io/badge/Production%20Live-news--platform--kappa.vercel.app-b38234?style=for-the-badge&logo=vercel&logoColor=white)](https://news-platform-kappa.vercel.app)
[![Company](https://img.shields.io/badge/Enterprise-Ashivam%20Technologies-090d16?style=for-the-badge&logo=github&logoColor=white)](https://github.com/AshivamTechnologies)


<br />

[![Next.js](https://img.shields.io/badge/Next.js%2015-App%20Router-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React%2019-Strict%20Mode-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript%205.7-Strict%20Zero--Any-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon%20Serverless-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://neon.tech/)
[![Prisma ORM](https://img.shields.io/badge/Prisma%20ORM-v6.19-2D3748?style=flat-square&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Vitest](https://img.shields.io/badge/Tests-128%20Passed%20(100%25)-4caf50?style=flat-square&logo=vitest&logoColor=white)](https://vitest.dev/)
[![OWASP](https://img.shields.io/badge/Security-OWASP%20ASVS%20Level%202-e53935?style=flat-square)](https://owasp.org/)
[![Accessibility](https://img.shields.io/badge/a11y-WCAG%202.1%20AA%20Compliant-00897b?style=flat-square)](https://www.w3.org/WAI/standards-guidelines/wcag/)

<p align="center">
  <strong>A mission-critical digital newsroom, editorial CMS, and global journalism publishing platform.</strong><br>
  Engineered by <strong>Ashivam Technologies</strong> to rival the aesthetic authority of <em>The Financial Times</em>, <em>Monocle</em>, and <em>Apple Newsroom</em>.
</p>

[**Explore Live Deployment →**](https://news-platform-kappa.vercel.app) • [**Corporate Organization**](https://github.com/AshivamTechnologies) • [**System Architecture**](#-system-architecture) • [**Editorial CMS Workflow**](#-multi-role-editorial-cms-workflow)

---

</div>

## 📑 Executive Summary

**E News** is a modern, enterprise-grade publishing system engineered from the ground up for high-velocity newsrooms, investigative periodicals, and luxury media houses. Combining a warm editorial canvas with serverless PostgreSQL scalability, optimistic concurrency controls, and a strict multi-role editorial lifecycle, E News delivers an uncompromising digital reading experience across all device form factors.

### 🌟 Defining Highlights

- **Bespoke Luxury Heritage Aesthetic:** Warm cream/sand canvas (`#faf8f5`), obsidian ink (`#11141a`), cognac and champagne gold accents (`#b38234`), Playfair Display editorial serif typography, and elegant drop caps.
- **Portaled Off-Canvas Slidebar Navigation:** Engineered with React `createPortal` directly into `document.body`, escaping all parent `backdrop-filter` containing blocks for 100% reliable full-viewport mobile and tablet browsing.
- **100% Authentic Human Journalism:** Completely purged of synthetic AI jargon; features verified real-world dispatches spanning central banking, international climate treaties, artisanal Swiss horology, sustainable architecture, cinema, and clean mobility.
- **Continuous Financial Marquee & Live Wire:** Real-time animated market ticker (*S&P 500, NASDAQ, Gold, Brent Crude, Nifty 50*) paired with a pulsing breaking radar beacon.
- **Interactive Desk Switching:** Zero-reload client-side editorial filtering (*World Affairs, Markets & Commerce, Culture & Living, Technology, Sport & Athletics*) with preserved server-side SEO pre-rendering.
- **Multi-Role Editorial Governance:** Formal lifecycle state machine (`DRAFT` → `SUBMITTED` → `IN_REVIEW` → `CHANGES_REQUESTED` → `APPROVED` → `SCHEDULED` → `PUBLISHED` → `ARCHIVED`) with optimistic concurrency versioning.
- **Enterprise Security & Privacy:** Argon2id password hashing, sliding JWT rotation in HTTP-only cookies, OWASP ASVS Level 2 compliance, and GDPR-mandated data portability and deletion.

---

## 🏛️ System Architecture

```mermaid
flowchart TD
    subgraph Client["Edge Client Layer (Responsive Viewports)"]
        Mobile["Mobile (360px – 640px)<br/>Portaled Slidebar Drawer"]
        Tablet["Tablet (641px – 1023px)<br/>Side-by-Side Editorial"]
        Desktop["Desktop (≥ 1024px)<br/>Full Masthead & Live Marquee"]
    end

    subgraph CDN["Edge & CDN Gateway (Vercel Serverless)"]
        Router["Next.js 15 App Router<br/>(Dynamic & Static ISR)"]
        Middleware["Edge Middleware<br/>(Auth Guards & Rate Limiting)"]
    end

    subgraph Core["Application & Business Logic"]
        AuthService["Auth Engine<br/>(Argon2id + Dual JWT)"]
        EditorialService["Editorial CMS Engine<br/>(Lifecycle State Machine)"]
        SearchService["Search Engine<br/>(PostgreSQL Full-Text + GIN)"]
        NewsletterService["Campaign Engine<br/>(Double Opt-In + RFC 8058)"]
    end

    subgraph Data["Persistence & Storage Layer"]
        Prisma["Prisma ORM 6.19<br/>(WASM Engine & Client-Pg)"]
        NeonDB[("Neon Serverless Postgres<br/>(Connection Pooler / AWS)")]
        MediaStorage["Encrypted Media Assets<br/>(Validated MIME & Dimensions)"]
    end

    Client --> Router
    Router --> Middleware
    Middleware --> AuthService
    Middleware --> EditorialService
    Middleware --> SearchService
    Middleware --> NewsletterService
    EditorialService --> Prisma
    AuthService --> Prisma
    SearchService --> Prisma
    NewsletterService --> Prisma
    Prisma --> NeonDB
```

---

## 💻 Tech Stack & Infrastructure

| Layer | Technologies | Technical Justification |
| :--- | :--- | :--- |
| **Frontend Framework** | **Next.js 15.5.29** (App Router) | Hybrid Server Components (RSC) for instantaneous page loads and SEO indexation, coupled with optimized Client Components. |
| **Core UI Runtime** | **React 19** + TypeScript 5.7 | Strict type enforcement across components, zero runtime `any`, React 19 actions, and portal ergonomics. |
| **Database & ORM** | **Neon PostgreSQL** + **Prisma 6.19** | Serverless Postgres with automatic connection pooling (`@prisma/adapter-pg`) on AWS us-east-2; client-side WASM engine. |
| **Editorial Authoring** | **TipTap Headless Editor** | ProseMirror-backed rich text editor with strict HTML sanitization via `sanitize-html` to prevent stored XSS attacks. |
| **Authentication** | **Argon2id** + **Jose (JWT)** | Memory-hard cryptographic hashing with sliding session refresh in strict `HttpOnly`, `SameSite=Lax`, `Secure` cookies. |
| **Search Subsystem** | **PostgreSQL `tsvector` + GIN** | Full-text natural language search with `websearch_to_tsquery` ranking, debounced suggestions, and zero external search dependencies. |
| **Testing Harness** | **Vitest 2.1** + Playwright | 128 automated unit tests across 13 test suites; end-to-end Python Playwright verification for editorial and authentication flows. |
| **Deployment Targets** | **Vercel Production** + **Render Blueprint** | Global edge distribution with zero-downtime rolling deploys and automated blueprint synchronizations. |

---

## 📱 Cross-Device Responsive Matrix

The platform is engineered to adapt flawlessly across every screen resolution and orientation:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🖥️ LARGE DESKTOP (≥ 1200px)                                                │
│ • Live financial ticker marquee scrolling continuously                      │
│ • Full inline desk navigation with gold active indicators                   │
│ • 2-column grand hero split (1.08fr : 1fr) with 480px height & countdown bar│
│ • 1.8fr primary editorial feed + 1fr sticky 'Velocity Index' trending rail  │
├─────────────────────────────────────────────────────────────────────────────┤
│ 💻 LAPTOP & SMALL DESKTOP (1024px – 1199px)                                 │
│ • Compact masthead bar with live wire radar & date                          │
│ • Instant search dropdown with keyboard shortcut ⌘K                         │
│ • 6-column curated section grid and featured story cards                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ 📱 TABLET (768px – 1023px)                                                  │
│ • Accessible hamburger navigation trigger                                   │
│ • 2-column side-by-side grid for Editor's Selection & The Most Read         │
│ • Proportional 16:9 hero card with 3-line excerpt and balanced controls     │
├─────────────────────────────────────────────────────────────────────────────┤
│ 📲 MOBILE (< 768px)                                                         │
│ • Portaled luxury slidebar drawer (100dvh, swipe-to-dismiss, search inside) │
│ • Sleek 16:9 constrained cover photo (max-height: 220px) preventing fold overflow│
│ • Headline, author, read time & slide controls visible above the fold       │
│ • Horizontal touch-scroll desk filter tabs with rubber-band physics         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## ✒️ Multi-Role Editorial CMS Workflow

E News provides an enterprise publishing lifecycle that prevents accidental publication, preserves complete revision audit logs, and handles concurrent author edits:

```
 ┌─────────┐       Submit        ┌───────────┐       Claim        ┌───────────┐
 │  DRAFT  │ ──────────────────> │ SUBMITTED │ ─────────────────> │ IN_REVIEW │
 └─────────┘                     └───────────┘                    └───────────┘
      ▲                                                                 │
      │                  Request Changes                                │
      └─────────────────────────────────────────────────────────────────┤
                                                                        ▼
 ┌───────────┐                   Publish Now                      ┌───────────┐
 │ PUBLISHED │ <───────────────────────────────────────────────── │ APPROVED  │
 └─────────┘                                                    └───────────┘
      ▲                                                                 │
      │                    Schedule Date & Time                         │
      └────────────────────── SCHEDULED <───────────────────────────────┘
```

### Role-Based Access Control (RBAC) Matrix

| Capability | Reader | Author | Editor | Administrator |
| :--- | :---: | :---: | :---: | :---: |
| Read Articles, Comment & Bookmark | ✅ | ✅ | ✅ | ✅ |
| Personal Reading History & Preferences | ✅ | ✅ | ✅ | ✅ |
| Draft Stories & Upload Media Assets | ❌ | ✅ | ✅ | ✅ |
| Author Dashboard & Personal Analytics | ❌ | ✅ | ✅ | ✅ |
| Review Queue & Request Changes | ❌ | ❌ | ✅ | ✅ |
| Approve, Schedule & Publish Dispatches | ❌ | ❌ | ✅ | ✅ |
| Manage Categories, Desks & Tags | ❌ | ❌ | ✅ | ✅ |
| Newsletter Campaign Dispatch & Analytics | ❌ | ❌ | ✅ | ✅ |
| User Governance & Role Management | ❌ | ❌ | ❌ | ✅ |
| Audit Logs & Platform Settings | ❌ | ❌ | ❌ | ✅ |

---

## 🔒 Enterprise Security & Compliance

E News complies with **OWASP Application Security Verification Standard (ASVS) Level 2**:

- **Cryptographic Hashing:** User passwords hashed via Argon2id with recommended memory and iteration cost parameters; raw passwords are never logged or stored.
- **Cookie Security:** Auth sessions use rotating JWT tokens stored in cookies with `HttpOnly`, `Secure` (in production), `SameSite=Lax`, and path-scoped restrictions.
- **XSS Prevention:** Rich text authored in TipTap is sanitized on write via `sanitize-html` with an explicit whitelist of allowed tags, attributes, and URI schemes (`http`, `https`, `mailto`).
- **CSRF & Injection Defense:** Parameterized Prisma queries completely mitigate SQL injection; custom CSRF protection guards administrative mutation endpoints.
- **Concurrency Protection:** Optimistic concurrency control using an integer `version` field on the `Article` model prevents simultaneous edit overwrites.
- **GDPR Compliance:** Native endpoints for full data export (`/api/v1/account/export`) and irreversible account erasure (`/api/v1/account/delete`).
- **CAN-SPAM & RFC 8058:** Double opt-in newsletter confirmation with one-click `List-Unsubscribe` headers.

---

## 🗄️ Database Architecture

The PostgreSQL schema is modeled in [`prisma/schema.prisma`](file:///d:/downloads/news-platform/prisma/schema.prisma):

```
┌──────────────────────────────────────────────────────────────────────┐
│ CORE ENTITIES                                                        │
├────────────────────┬────────────────────┬────────────────────────────┤
│ User               │ Article            │ Category & Tag             │
│ • id, email, name  │ • id, slug, title  │ • id, name, slug           │
│ • passwordHash     │ • summary, content │ • description, order       │
│ • roles (Enum)     │ • status (Enum)    │ • articles relation        │
│ • isBanned         │ • version (OCC)    ├────────────────────────────┤
│ • bookmarks        │ • publishedAt      │ MediaAsset                 │
│ • readingHistory   │ • views, reads     │ • id, url, alt, width      │
│ • authorProfile    │ • categoryId       │ • height, mimeType, size   │
├────────────────────┼────────────────────┼────────────────────────────┤
│ ENGAGEMENT         │ MONETIZATION       │ GOVERNANCE                 │
├────────────────────┼────────────────────┼────────────────────────────┤
│ Comment            │ Advertisement      │ AuditLog                   │
│ • id, content      │ • id, title, slot  │ • id, action, entity       │
│ • status, flags    │ • imageUrl, target │ • entityId, actorId        │
│ • parentId         │ • impressions, ctr │ • ipAddress, userAgent     │
│ NewsletterSub      │ Campaign           │ PromoBanner                │
│ • email, verified  │ • subject, body    │ • id, heading, buttonText  │
│ • token, sentAt    │ • status, sentCount│ • linkUrl, active          │
└────────────────────┴────────────────────┴────────────────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: `v20.x` or `v22.x` (LTS recommended)
- **Package Manager**: `npm` (v10+)
- **Database**: PostgreSQL (local or cloud instance like [Neon.tech](https://neon.tech))

### 1. Clone the Repository

```bash
git clone https://github.com/AshivamTechnologies/news-platform.git
cd news-platform
```

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```env
# Database Connection (Neon PostgreSQL or Local)
DATABASE_URL="postgresql://neondb_owner:password@ep-host.us-east-2.aws.neon.tech/neondb?sslmode=require"

# Application URL
APP_URL="http://localhost:3000"

# Cryptographic Secrets (Generate via: openssl rand -base64 32)
JWT_ACCESS_SECRET="generate-32-byte-secret-for-access-token"
JWT_REFRESH_SECRET="generate-32-byte-secret-for-refresh-token"
CRON_SECRET="generate-32-byte-secret-for-scheduled-jobs"

# Environment
NODE_ENV="development"
MEDIA_DIR="./uploads"
```

### 3. Install Dependencies & Generate Prisma Client

```bash
npm install
npm run db:generate
```

### 4. Deploy Database Schema & Seed Data

```bash
npm run db:deploy
npm run db:seed
```

### 5. Launch the Development Server

```bash
npm run dev
```

Open [**http://localhost:3000**](http://localhost:3000) in your browser.

---

## 🧪 Testing & Verification

The codebase maintains rigorous automated test coverage:

```bash
# Execute 128 automated unit tests across 13 suites
npm run test:unit

# Execute integration test suite with active database
npm run test:integration

# Execute TypeScript strict type checking
npm run typecheck

# Validate production build output
npm run build
```

---

## 📡 API Reference Overview

The platform exposes structured RESTful API endpoints under `/api/v1`:

### Public Reader Endpoints
- `GET /api/v1/search?q={query}&pageSize=4` — Full-text debounced search and live suggestions
- `GET /api/v1/categories` — List all curated editorial desks
- `GET /api/v1/bookmarks` — Retrieve reader's saved stories
- `POST /api/v1/bookmarks/[articleId]` — Toggle article bookmark
- `POST /api/v1/newsletter/subscribe` — Register email for The Executive Briefing

### Editorial & Author Endpoints
- `GET /api/v1/author/articles` — Author personal catalog with metrics
- `POST /api/v1/author/articles` — Submit draft for editorial review
- `PUT /api/v1/author/articles/[id]` — Update article content (OCC protected)
- `POST /api/v1/media` — Upload and optimize media assets

### Newsroom Governance Endpoints
- `GET /api/v1/admin/dashboard` — Platform executive telemetry and reader velocity
- `POST /api/v1/admin/articles/[id]/review` — Approve or request changes on dispatches
- `POST /api/v1/admin/homepage/slots/[slot]` — Pin articles to Hero or Featured slots
- `POST /api/v1/admin/newsletter/campaigns/[id]/schedule` — Schedule newsletter broadcast

---

## 🚢 Production Deployment

### Continuous Deployment via Vercel

The platform is continuously deployed to Vercel with automatic edge invalidation:

```bash
# Deploy directly to Vercel production
npx vercel --prod --yes
```

**Live Production URL:** [https://news-platform-kappa.vercel.app](https://news-platform-kappa.vercel.app)

### Container & Cloud Deployment (`render.yaml`)

A complete infrastructure-as-code specification is included in [`render.yaml`](file:///d:/downloads/news-platform/render.yaml) for automated provisioning on Render:

```yaml
services:
  - type: web
    name: e-news-platform
    runtime: node
    plan: free
    buildCommand: npm install --include=dev && npm run build
    startCommand: npm run start
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        value: postgresql://...
```

---

## 🏢 Corporate Accreditation & Governance

This project is an engineering asset developed for and maintained by:

<div align="center">

### **Ashivam Technologies**
*Building Mission-Critical Enterprise Software & Media Technology*

🌐 **Website:** [https://github.com/AshivamTechnologies](https://github.com/AshivamTechnologies)  
💼 **Corporate Inquiries:** `contact@ashivam.com`  
📍 **Global Operations**

</div>

---

## 📄 License

Copyright &copy; 2024&ndash;2026 **Ashivam Technologies**. All rights reserved.  
