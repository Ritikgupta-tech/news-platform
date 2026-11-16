"use client";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { PRIMARY_NAV } from "@/config/navigation";
import type { SessionUser } from "@/types/news";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  brand?: string;
  user: SessionUser | null;
  pathname: string;
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileDrawer({ isOpen, onClose, brand = "E News", user, pathname }: Props) {
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll and handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    const originalTouchAction = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    // Autofocus close button when drawer opens for a11y
    setTimeout(() => closeBtnRef.current?.focus(), 50);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.touchAction = originalTouchAction;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!mounted || !isOpen) return null;

  const content = (
    <div
      className="mobile-drawer-portal"
      role="dialog"
      aria-modal="true"
      aria-label="Site navigation"
    >
      {/* Dimmed backdrop overlay */}
      <div
        className="mobile-drawer__backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Off-canvas slidebar drawer panel */}
      <aside className="mobile-drawer__panel">
        {/* Drawer Header */}
        <div className="mobile-drawer__header">
          <Link href="/" className="brand" onClick={onClose}>
            <span className="brand__mark" aria-hidden="true"><span>E</span></span>
            <span className="brand__titles">
              <span className="brand__name">NEWS</span>
              <span className="brand__tagline">GLOBAL EDITION</span>
            </span>
          </Link>
          <button
            type="button"
            ref={closeBtnRef}
            className="icon-btn mobile-drawer__close"
            aria-label="Close navigation menu"
            onClick={onClose}
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* Quick Search Input */}
        <div className="mobile-drawer__search">
          <form
            action="/search"
            method="get"
            onSubmit={(e) => {
              if (!searchQuery.trim()) e.preventDefault();
              else onClose();
            }}
          >
            <Icon name="search" size={16} className="drawer-search__icon" />
            <input
              type="search"
              name="q"
              placeholder="Search global dispatches..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoComplete="off"
            />
          </form>
        </div>

        {/* Primary Editorial Desks */}
        <div className="mobile-drawer__section">
          <span className="mobile-drawer__label">EDITORIAL DESKS</span>
          <nav aria-label="Mobile Desks" className="mobile-drawer__nav">
            <ul>
              {PRIMARY_NAV.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`mobile-drawer__link ${active ? "is-active" : ""}`}
                      aria-current={active ? "page" : undefined}
                      onClick={onClose}
                    >
                      <span className="drawer-link__text">{item.label}</span>
                      {active ? (
                        <span className="drawer-link__active-badge" aria-label="Current desk">CURRENT</span>
                      ) : (
                        <Icon name="chevronRight" size={16} className="drawer-link__arrow" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        {/* Reader Services & Shortcuts */}
        <div className="mobile-drawer__section">
          <span className="mobile-drawer__label">READER SERVICES</span>
          <div className="mobile-drawer__quick-grid">
            <Link href="/bookmarks" className="mobile-drawer__quick-card" onClick={onClose}>
              <Icon name="bookmark" size={18} />
              <span>Saved Stories</span>
            </Link>
            <Link href="/reading-history" className="mobile-drawer__quick-card" onClick={onClose}>
              <Icon name="clock" size={18} />
              <span>Reading History</span>
            </Link>
            <Link href="/preferences" className="mobile-drawer__quick-card" onClick={onClose}>
              <Icon name="sparkles" size={18} />
              <span>Preferences</span>
            </Link>
            <Link href="/newsletter" className="mobile-drawer__quick-card" onClick={onClose}>
              <Icon name="mail" size={18} />
              <span>Executive Briefing</span>
            </Link>
          </div>
        </div>

        {/* User Account / Membership CTA */}
        <div className="mobile-drawer__section mobile-drawer__account">
          {user ? (
            <div className="drawer-user-card">
              <div className="drawer-user-card__info">
                <span className="avatar avatar--sm" aria-hidden="true">
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="drawer-user-card__meta">
                  <strong>{user.name}</strong>
                  <span>{user.email}</span>
                </div>
              </div>
              <div className="drawer-user-card__actions">
                <Link href="/profile" className="btn btn--secondary btn--sm btn--full" onClick={onClose}>
                  My Account &amp; Subscription
                </Link>
                {user.roles.some((r) => r === "AUTHOR" || r === "EDITOR" || r === "ADMIN") ? (
                  <Link href="/author/dashboard" className="btn btn--ghost btn--sm btn--full" onClick={onClose}>
                    Author Studio
                  </Link>
                ) : null}
                {user.roles.some((r) => r === "EDITOR" || r === "ADMIN") ? (
                  <Link href="/admin/articles?scope=review" className="btn btn--ghost btn--sm btn--full" onClick={onClose}>
                    Editorial Review Queue
                  </Link>
                ) : null}
                {user.roles.includes("ADMIN") ? (
                  <Link href="/admin" className="btn btn--ghost btn--sm btn--full" onClick={onClose}>
                    Newsroom Console &amp; Admin
                  </Link>
                ) : null}
                <form action="/api/v1/auth/logout" method="post">
                  <button type="submit" className="drawer-logout-btn">
                    Sign Out
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="drawer-cta-card">
              <div className="drawer-cta-card__head">
                <span className="gold-crest" aria-hidden="true">✦</span>
                <strong>The Executive Briefing</strong>
              </div>
              <p>Independent global reporting and intelligence delivered daily at market open.</p>
              <div className="drawer-cta-card__buttons">
                <Link href="/newsletter" className="btn btn--gold btn--full" onClick={onClose}>
                  Subscribe to Briefing
                </Link>
                <Link href="/login" className="btn btn--ghost btn--full drawer-signin-btn" onClick={onClose}>
                  Subscriber Sign In
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Footer: Edition & Legal */}
        <div className="mobile-drawer__footer">
          <div className="drawer-footer__edition">
            <span className="live-dot" aria-hidden="true" />
            <span>GLOBAL ENGLISH EDITION</span>
          </div>
          <div className="drawer-footer__links">
            <Link href="/about" onClick={onClose}>About</Link>
            <span className="drawer-footer__sep">•</span>
            <Link href="/contact" onClick={onClose}>Contact</Link>
            <span className="drawer-footer__sep">•</span>
            <Link href="/privacy" onClick={onClose}>Privacy</Link>
            <span className="drawer-footer__sep">•</span>
            <Link href="/terms" onClick={onClose}>Terms</Link>
          </div>
          <p className="drawer-footer__copy">
            &copy; {new Date().getFullYear()} {brand}. All rights reserved.
          </p>
        </div>
      </aside>
    </div>
  );

  return createPortal(content, document.body);
}
