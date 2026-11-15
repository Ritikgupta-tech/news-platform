# Design system (Stage 3)

Plain CSS with design tokens. No CSS framework or component library was added in this stage, so there are no new dependencies.
Tailwind / shadcn can be layered on later; the tokens are already CSS variables and map directly onto a Tailwind theme.

## Files
- `src/styles/tokens.css`: colours, type scale, spacing (4px base), radii (10/14/18px), restrained shadows, motion durations, layout widths.
- `src/styles/globals.css`: reset, layout helpers and all component styles. Reduced motion zeroes the duration tokens and disables smooth scroll.
- `src/components/ui`: `Icon`, `Button`/`ButtonLink`, `Badge`, `Skeleton`, `SectionHeading`, `StateMessage` (empty / error / unauthorized).
- `src/components/layout`: `SiteHeader` (client), `SiteFooter`.
- `src/components/news`: `HeroCarousel` (client), `ArticleCard`/`ArticleRow`, `RankedList`, `FeaturedStories`, `CategoryShortcuts`, `NewsletterCard` (client), `PromoBanner`, `ArticleImage`, `ArticleMeta`.
- `src/types/news.ts`: view-model types the Articles API must return (Stage 5-6).
- `src/config/navigation.ts`: primary nav, category shortcuts, footer links.

## Behaviour implemented
- Header: sticky, active-route indicator (`aria-current`), search (GET `/search?q=`), notifications popover and account menu (Escape and outside-click close), mobile drawer (Escape closes and returns focus, body scroll locked), skip link. Inline search shows from 1200px; below that a toggle opens it.
- Hero: previous/next, dots, swipe, optional auto-play (off by default, never runs under `prefers-reduced-motion`, pauses on hover/focus), `aria-roledescription="carousel"` and a live region.
- Newsletter: client validation, consent checkbox, and distinct messages for success, duplicate (409), validation (400/422) and failure. It posts to `/api/v1/newsletter/subscribe`, which does **not exist yet**, so it currently reports an error rather than faking success.
- Ranked lists render a view count only when real data is passed in.

## Responsive
Mobile-first. Breakpoints used: 640, 768, 1024, 1200. Hero stacks image-first on mobile and splits at 768. Latest News rows stack below 640. Category grid is 2 / 3 / 6 columns. Checked for horizontal overflow at 360, 390, 768, 1024, 1280 and 1920px.

## Preview route
`/design-system` is a dev-only gallery (404 in production builds, `noindex`). It uses `src/dev/fixtures.ts`, which is labelled placeholder data with generated gradient images. It is **not** news content and must not be imported by production routes.

## Not done in this stage
- The Dribbble screenshot was not supplied, so the layout follows the written composition in the brief (Phase 2.2 / 19). Compare it against the screenshot and send corrections.
- No real photography; no `next/image` or `next/font` yet (both need the media pipeline and network at build time). Fonts fall back to Inter if installed, otherwise system sans; headlines use a serif stack.
- Dark mode, scroll-triggered reveals and Motion/GSAP are not included; only CSS transitions are used so far.
