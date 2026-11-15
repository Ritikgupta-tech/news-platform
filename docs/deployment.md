# Production Deployment Guide: E News Platform

This guide outlines the production deployment architectures for **E News Platform**, covering **Vercel**, **Render**, and **Containerized Docker** environments.

---

## 1. Environment Variables Overview

Ensure the following variables are configured in your production environment:

| Variable | Description | Example / Recommendation |
|---|---|---|
| `NODE_ENV` | Environment mode | `production` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/enews?sslmode=require` |
| `APP_URL` | Public canonical origin (used for CSRF and emails) | `https://news.yourdomain.com` |
| `JWT_ACCESS_SECRET` | 64+ char random hex secret for access tokens | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_REFRESH_SECRET` | 64+ char random hex secret for refresh token rotation | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `CRON_SECRET` | Secret token guarding internal scheduling jobs | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `MEDIA_DIR` | Local path for persistent image uploads | `/var/data/uploads` or `./uploads` |
| `MAIL_PROVIDER` | Email delivery provider (`console` or `resend`) | `resend` |
| `RESEND_API_KEY` | Resend API key (if `MAIL_PROVIDER=resend`) | `re_...` |
| `MAIL_FROM` | Sender identity on verified domain | `E News <news@yourdomain.com>` |
| `TRUST_PROXY` | Set to `1` only if behind trusted reverse proxy | `1` on Render/Vercel/Cloudflare |

---

## 2. Deploying to Vercel

Vercel provides edge hosting for Next.js applications.

### Step 1: Push Repository to GitHub
Ensure the codebase is pushed to your GitHub repository:
```bash
git push -u origin main
```

### Step 2: Import into Vercel
1. Go to [vercel.com](https://vercel.com) and click **"Add New Project"**.
2. Select your repository `news-platform`.
3. Framework Preset: **Next.js** (automatically detected via `vercel.json`).
4. Build Command: `prisma generate && next build`.

### Step 3: Configure Database (Vercel Postgres, Neon, or Supabase)
1. In Vercel, attach a **Vercel Postgres** or external PostgreSQL database (e.g., [Neon](https://neon.tech) / [Supabase](https://supabase.com)).
2. Under **Project Settings > Environment Variables**, ensure `DATABASE_URL` is set with SSL enabled (`sslmode=require`).
3. Set `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CRON_SECRET`, and `APP_URL`.

### Step 4: Run Initial Database Migration
Run database migration from your local environment or CI:
```bash
npx prisma migrate deploy
```

---

## 3. Deploying to Render (100% Free Tier - No Credit Card Required)

Render provides a completely free tier for both Web Services and PostgreSQL databases without requiring payment details or credit cards.

### Using Render Free Blueprint (`render.yaml`)
A 100% Free Tier `render.yaml` specification is configured in the root directory:

1. Go to [render.com](https://render.com) and click **"Blueprints"** -> **"New Blueprint Instance"**.
2. Connect your GitHub repository `Ritikgupta-tech/news-platform`.
3. Render automatically provisions the free resources:
   - **`enews-postgres`**: Render Free Tier PostgreSQL database (`plan: free`).
   - **`e-news-platform`**: Render Free Tier Web Service (`plan: free`) running Node 22 with auto-generated secrets (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CRON_SECRET`).
   - **Zero Payment / No Card**: Uses `plan: free` with no paid disks or starter plans.
4. Set `APP_URL` to your Render URL (e.g., `https://e-news-platform.onrender.com`).
5. Click **"Apply"** to deploy for free.

### Scheduled Background Publishing on Render
To process scheduled articles and newsletter campaigns on a regular cron:
Create a **Render Cron Job**:
- **Schedule**: `*/5 * * * *` (every 5 minutes)
- **Command**: `curl -X POST https://e-news-platform.onrender.com/api/v1/internal/jobs/publish-scheduled -H "Authorization: Bearer $CRON_SECRET"`

---

## 4. Deploying with Docker / Self-Hosted

For deployment on VPS (Ubuntu/Debian) or AWS/GCP/DigitalOcean:

### Step 1: Start Services with Docker Compose
```bash
docker compose up -d
```

### Step 2: Build and Run Production Container
```bash
docker build -t e-news-platform:latest .
docker run -d \
  --name enews-app \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://enews:enews_dev_password@host.docker.internal:5432/enews" \
  -e APP_URL="https://yourdomain.com" \
  -e JWT_ACCESS_SECRET="..." \
  -e JWT_REFRESH_SECRET="..." \
  -e CRON_SECRET="..." \
  -v enews_uploads:/app/uploads \
  e-news-platform:latest
```

---

## 5. Post-Deployment Verification

Verify these endpoints after deployment:
1. `GET /api/v1/health` -> returns `{ "status": "ok" }`
2. `GET /feed.xml` -> returns RSS 2.0 XML
3. `GET /sitemap.xml` -> returns valid XML sitemap
4. `GET /robots.txt` -> returns robots rules
5. Reader journey: Register at `/register`, view `/news`, test search suggestions in navbar.
6. Editorial journey: Log in as editor, review articles at `/admin/articles`, manage ads at `/admin/advertisements`.
