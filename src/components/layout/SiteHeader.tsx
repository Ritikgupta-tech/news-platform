"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { PRIMARY_NAV } from "@/config/navigation";
import { formatRelative } from "@/lib/format";
import type { NotificationItem, SessionUser } from "@/types/news";
import { useDismiss } from "./useDismiss";
import { MobileDrawer } from "./MobileDrawer";
import { MarketTicker } from "./MarketTicker";

interface Props {
  brand?: string;
  user: SessionUser | null;
  notifications?: NotificationItem[];
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader({ brand = "E News", user, notifications = [] }: Props) {
  const pathname = usePathname() ?? "/";
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<"none" | "notifications" | "account">("none");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<{ id: string; title: string; slug: string; category: { name: string } }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const closePanel = useCallback(() => setPanel("none"), []);
  useDismiss(popRef, panel !== "none", closePanel);
  useDismiss(searchContainerRef, showSuggestions, () => setShowSuggestions(false));

  // Live search debounced suggestions
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/search?q=${encodeURIComponent(searchQuery.trim())}&pageSize=4`);
        if (res.ok) {
          const json = await res.json();
          setSuggestions(json.data || []);
          setShowSuggestions(true);
        }
      } catch {
        // silent fallback
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Close transient UI on navigation.
  useEffect(() => {
    setMenuOpen(false);
    setPanel("none");
    setSearchOpen(false);
    setShowSuggestions(false);
  }, [pathname]);

  // Lock body scroll while the mobile menu is open; Escape closes it and returns focus.
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        menuBtnRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <header className="site-header">
      <a href="#main" className="skip-link">Skip to content</a>

      {/* Top Luxury Masthead Bar */}
      <div className="top-ticker-bar">
        <div className="container top-ticker-bar__inner">
          <div className="top-ticker-bar__edition">
            <span className="live-dot" aria-hidden="true" />
            <span className="top-ticker-bar__edition-tag">GLOBAL EDITION</span>
            <span className="top-ticker-bar__divider" aria-hidden="true">|</span>
            <span className="top-ticker-bar__date">
              {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>

          {/* Dynamic Editorial Market Ticker with Delay Notice and Attribution */}
          <MarketTicker />

          <div className="top-ticker-bar__live">
            <Link href="/news" className="live-bulletin-link">
              <span className="pulse-radar" aria-hidden="true" />
              <span>LIVE WIRE</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Luxury Navigation Bar */}
      <div className="container site-header__bar">
        <button
          ref={menuBtnRef}
          type="button"
          className="icon-btn site-header__menu-btn"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <Icon name={menuOpen ? "close" : "menu"} />
        </button>

        <Link href="/" className="brand" aria-label={`${brand} home`}>
          <span className="brand__mark" aria-hidden="true">
            <span>E</span>
          </span>
          <span className="brand__titles">
            <span className="brand__name">NEWS</span>
            <span className="brand__tagline">THE INDEPENDENT JOURNAL</span>
          </span>
        </Link>

        <nav className="primary-nav" aria-label="Primary">
          <ul>
            {PRIMARY_NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link href={item.href} className="primary-nav__link" aria-current={active ? "page" : undefined}>
                    {item.label}
                    {active ? <span className="primary-nav__indicator" aria-hidden="true" /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="site-header__actions" ref={popRef}>
          {/* Live Search */}
          <div ref={searchContainerRef} style={{ position: "relative" }}>
            <form action="/search" method="get" role="search" className={`search ${searchOpen ? "search--open" : ""}`}>
              <label htmlFor="site-search" className="visually-hidden">Search news</label>
              <Icon name="search" size={17} className="search__icon" />
              <input
                id="site-search"
                name="q"
                type="search"
                placeholder="Search global stories..."
                maxLength={120}
                autoComplete="off"
                minLength={2}
                required
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
              />
              <span className="search__shortcut-hint" aria-hidden="true">⌘K</span>
            </form>
            {showSuggestions && suggestions.length > 0 ? (
              <div className="popover popover--suggestions">
                <div className="popover__head"><strong>Instant Matches</strong></div>
                <ul className="popover__list">
                  {suggestions.map((s) => (
                    <li key={s.id} style={{ padding: "8px 12px" }}>
                      <span className="badge badge--gold" style={{ fontSize: "0.6875rem", alignSelf: "flex-start", marginBottom: "4px" }}>
                        {s.category.name}
                      </span>
                      <Link
                        href={`/news/${s.slug}`}
                        onClick={() => setShowSuggestions(false)}
                        style={{ fontSize: "var(--fs-sm)", fontWeight: 600, lineHeight: 1.35 }}
                      >
                        {s.title}
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link href={`/search?q=${encodeURIComponent(searchQuery)}`} onClick={() => setShowSuggestions(false)} className="popover__foot">
                  Explore all results for &ldquo;{searchQuery}&rdquo; →
                </Link>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className="icon-btn search-toggle"
            aria-label="Search"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((v) => !v)}
          >
            <Icon name="search" />
          </button>

          {/* Quick Bookmarks Shortcut */}
          <Link href="/bookmarks" className="icon-btn header-bookmarks-btn" aria-label="Saved Bookmarks" title="Saved Bookmarks">
            <Icon name="bookmark" size={18} />
          </Link>

          {/* Notifications */}
          <div className="popover-anchor">
            <button
              type="button"
              className="icon-btn notifications-btn"
              aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
              aria-expanded={panel === "notifications"}
              aria-haspopup="dialog"
              onClick={() => setPanel(panel === "notifications" ? "none" : "notifications")}
            >
              <Icon name="bell" />
              {unread > 0 ? <span className="notification-badge">{unread}</span> : null}
            </button>
            {panel === "notifications" ? (
              <div className="popover popover--notifications" role="dialog" aria-label="Notifications">
                <div className="popover__head">
                  <strong>Editorial Dispatches</strong>
                  <span>{unread > 0 ? `${unread} unread alerts` : "All alerts read"}</span>
                </div>
                {user === null ? (
                  <p className="popover__empty"><Link href="/login">Sign in</Link> to view tailored dispatches.</p>
                ) : notifications.length === 0 ? (
                  <p className="popover__empty">You are completely up to date.</p>
                ) : (
                  <ul className="popover__list">
                    {notifications.map((n) => (
                      <li key={n.id} className={n.read ? "" : "is-unread"}>
                        <Link href={n.href ?? "/notifications"}>{n.title}</Link>
                        <time dateTime={n.createdAt}>{formatRelative(n.createdAt)}</time>
                      </li>
                    ))}
                  </ul>
                )}
                <Link href="/notifications" className="popover__foot">View all notifications</Link>
              </div>
            ) : null}
          </div>

          {/* User Profile or Subscribe CTA */}
          <div className="popover-anchor">
            {user ? (
              <>
                <button
                  type="button"
                  className="avatar-btn"
                  aria-label="Account menu"
                  aria-expanded={panel === "account"}
                  aria-haspopup="menu"
                  onClick={() => setPanel(panel === "account" ? "none" : "account")}
                >
                  <span className="avatar" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span>
                  <Icon name="chevronDown" size={15} className="avatar-btn__caret" />
                </button>
                {panel === "account" ? (
                  <div className="popover popover--menu" role="menu" aria-label="Account">
                    <div className="popover__head">
                      <strong>{user.name}</strong>
                      <span>{user.email}</span>
                    </div>
                    <Link role="menuitem" href="/profile">Profile &amp; Subscription</Link>
                    <Link role="menuitem" href="/bookmarks">Saved Stories</Link>
                    <Link role="menuitem" href="/reading-history">Reading History</Link>
                    <Link role="menuitem" href="/preferences">Editorial Preferences</Link>
                    {user.roles.some((r) => r === "AUTHOR" || r === "EDITOR" || r === "ADMIN") ? (
                      <Link role="menuitem" href="/author/dashboard">Author Dashboard</Link>
                    ) : null}
                    {user.roles.some((r) => r === "EDITOR" || r === "ADMIN") ? (
                      <Link role="menuitem" href="/admin/articles?scope=review">Review Queue</Link>
                    ) : null}
                    {user.roles.includes("ADMIN") ? (
                      <Link role="menuitem" href="/admin">Newsroom Governance</Link>
                    ) : null}
                    <form action="/api/v1/auth/logout" method="post">
                      <button role="menuitem" type="submit" className="logout-btn">Sign Out</button>
                    </form>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="auth-actions">
                <Link href="/login" className="btn btn--ghost btn--sm">Log in</Link>
                <Link href="/subscribe" className="btn btn--gold btn--sm subscribe-btn">
                  <span>Subscribe</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Luxury Mobile Navigation Drawer (Portaled to document.body for clean fixed viewport rendering) */}
      <MobileDrawer
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        brand={brand}
        user={user}
        pathname={pathname}
      />
    </header>
  );
}
