"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { PRIMARY_NAV } from "@/config/navigation";
import { formatRelative } from "@/lib/format";
import type { NotificationItem, SessionUser } from "@/types/news";
import { useDismiss } from "./useDismiss";

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
  useEffect(() => { setMenuOpen(false); setPanel("none"); setSearchOpen(false); setShowSuggestions(false); }, [pathname]);

  // Lock body scroll while the mobile menu is open; Escape closes it and returns focus.
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenuOpen(false); menuBtnRef.current?.focus(); } };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [menuOpen]);

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <header className="site-header">
      <a href="#main" className="skip-link">Skip to content</a>
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
          <span className="brand__mark" aria-hidden="true">E</span>
          <span className="brand__name">{brand.replace(/^E\s?/, "")}</span>
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
          <div ref={searchContainerRef} style={{ position: "relative" }}>
            <form action="/search" method="get" role="search" className={`search ${searchOpen ? "search--open" : ""}`}>
              <label htmlFor="site-search" className="visually-hidden">Search news</label>
              <Icon name="search" size={18} className="search__icon" />
              <input
                id="site-search"
                name="q"
                type="search"
                placeholder="Search news"
                maxLength={120}
                autoComplete="off"
                minLength={2}
                required
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
              />
            </form>
            {showSuggestions && suggestions.length > 0 ? (
              <div className="popover" style={{ top: "calc(100% + 8px)", right: 0, width: "min(90vw, 320px)", zIndex: 70 }}>
                <div className="popover__head"><strong>Suggestions</strong></div>
                <ul className="popover__list">
                  {suggestions.map((s) => (
                    <li key={s.id} style={{ padding: "8px 12px" }}>
                      <span style={{ fontSize: "var(--fs-xs)", color: "var(--c-accent)", fontWeight: 600 }}>{s.category.name}</span>
                      <Link href={`/news/${s.slug}`} onClick={() => setShowSuggestions(false)} style={{ fontSize: "var(--fs-sm)", fontWeight: 500, lineHeight: 1.3 }}>
                        {s.title}
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link href={`/search?q=${encodeURIComponent(searchQuery)}`} onClick={() => setShowSuggestions(false)} className="popover__foot">
                  View all results for &ldquo;{searchQuery}&rdquo;
                </Link>
              </div>
            ) : null}
          </div>
          <button type="button" className="icon-btn search-toggle" aria-label="Search" aria-expanded={searchOpen} onClick={() => setSearchOpen((v) => !v)}>
            <Icon name="search" />
          </button>

          <div className="popover-anchor">
            <button
              type="button"
              className="icon-btn"
              aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
              aria-expanded={panel === "notifications"}
              aria-haspopup="dialog"
              onClick={() => setPanel(panel === "notifications" ? "none" : "notifications")}
            >
              <Icon name="bell" />
              {unread > 0 ? <span className="dot" aria-hidden="true" /> : null}
            </button>
            {panel === "notifications" ? (
              <div className="popover" role="dialog" aria-label="Notifications">
                <div className="popover__head"><strong>Notifications</strong></div>
                {user === null ? (
                  <p className="popover__empty"><Link href="/login">Log in</Link> to see your notifications.</p>
                ) : notifications.length === 0 ? (
                  <p className="popover__empty">You&rsquo;re all caught up.</p>
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
                <Link href="/notifications" className="popover__foot">View all</Link>
              </div>
            ) : null}
          </div>

          <div className="popover-anchor">
            {user ? (
              <>
                <button type="button" className="avatar-btn" aria-label="Account menu" aria-expanded={panel === "account"} aria-haspopup="menu" onClick={() => setPanel(panel === "account" ? "none" : "account")}>
                  <span className="avatar" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span>
                  <Icon name="chevronDown" size={16} className="avatar-btn__caret" />
                </button>
                {panel === "account" ? (
                  <div className="popover popover--menu" role="menu" aria-label="Account">
                    <div className="popover__head"><strong>{user.name}</strong><span>{user.email}</span></div>
                    <Link role="menuitem" href="/profile">Profile</Link>
                    <Link role="menuitem" href="/bookmarks">Bookmarks</Link>
                    <Link role="menuitem" href="/reading-history">Reading history</Link>
                    <Link role="menuitem" href="/preferences">Preferences</Link>
                    {user.roles.some((r) => r === "AUTHOR" || r === "EDITOR" || r === "ADMIN") ? <Link role="menuitem" href="/author/dashboard">Author dashboard</Link> : null}
                    {user.roles.some((r) => r === "EDITOR" || r === "ADMIN") ? <Link role="menuitem" href="/admin/articles?scope=review">Review queue</Link> : null}
                    {user.roles.includes("ADMIN") ? <Link role="menuitem" href="/admin">Admin</Link> : null}
                    <form action="/api/v1/auth/logout" method="post"><button role="menuitem" type="submit">Log out</button></form>
                  </div>
                ) : null}
              </>
            ) : (
              <Link href="/login" className="btn btn--primary btn--sm">Log in</Link>
            )}
          </div>
        </div>
      </div>

      <div id="mobile-nav" className={`mobile-nav ${menuOpen ? "is-open" : ""}`} hidden={!menuOpen}>
        <nav aria-label="Mobile">
          <ul>
            {PRIMARY_NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} aria-current={isActive(pathname, item.href) ? "page" : undefined}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
