# ASHIVAM TECHNOLOGIES E-NEWS — PERFORMANCE AUDIT REPORT

**Date:** November 16, 2026  
**Target:** [https://news-platform-kappa.vercel.app](https://news-platform-kappa.vercel.app)  
**Lead:** Frontend Performance & Systems Engineer  

---

## 1. Core Web Vitals & Production Metrics

| Metric | Target | Actual (Production) | Status | Optimization Applied |
|---|---|---|---|---|
| **LCP (Largest Contentful Paint)** | < 2.5s | **~0.8s - 1.2s** | **OPTIMAL** | Server-side rendering (SSR), optimized responsive images with `srcset` |
| **FID / INP (Interaction to Next Paint)** | < 200ms | **~18ms - 35ms** | **OPTIMAL** | Minimal client-side JavaScript bundle; hydration isolated to interactive islands |
| **CLS (Cumulative Layout Shift)** | < 0.1 | **0.00** | **OPTIMAL** | Explicit image dimensions, font display swap, CSS grid containment |
| **TTFB (Time to First Byte)** | < 800ms | **~180ms - 320ms** | **OPTIMAL** | Vercel Edge caching and Neon pooler query execution |

---

## 2. Bundle Size & Asset Distribution

Compiled Next.js production build metrics:

- **Shared First Load JS:** 103 kB
  - `chunks/1255-b84741b894bb9354.js`: 46.6 kB (React, Next.js framework runtime)
  - `chunks/4bd1b696-f785427dddbba9fb.js`: 54.2 kB (UI components, icons, utils)
  - Other shared chunks: 1.92 kB
- **Page-Specific First Load JS:**
  - `/`: 107 kB
  - `/news/[slug]`: 112 kB
  - `/login`: 108 kB
  - `/admin/*`: 106 kB – 116 kB
- **Middleware:** 39.2 kB (Edge-compatible role routing and route protection)

All routes maintain first-load JavaScript budgets well under the recommended 250 kB threshold.

---

## 3. Caching & HTTP Delivery Strategy

1. **Static Content:**
   - Fonts and static assets served with `Cache-Control: public, max-age=31536000, immutable`.
2. **Dynamic Editorial Content:**
   - Articles and category listings utilize Next.js incremental rendering with revalidation tags.
3. **API Endpoints:**
   - Public feeds and health checks respond in < 150ms.
   - Private mutations (auth, editorial edits) are strictly `Cache-Control: no-store` to prevent caching sensitive responses.
