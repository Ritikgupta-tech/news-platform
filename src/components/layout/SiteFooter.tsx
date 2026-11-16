import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";
import { CATEGORY_SHORTCUTS, FOOTER_LINKS } from "@/config/navigation";

export interface SocialLink { label: string; href: string; icon: IconName }

export function SiteFooter({
  brand = "E News",
  socials = [
    { label: "X", href: "https://x.com", icon: "x" },
    { label: "YouTube", href: "https://youtube.com", icon: "youtube" },
    { label: "Instagram", href: "https://instagram.com", icon: "instagram" },
  ],
  contactEmail,
}: {
  brand?: string;
  socials?: SocialLink[];
  contactEmail?: string;
}) {
  return (
    <footer className="site-footer">
      <div className="container site-footer__grid">
        <div className="site-footer__about">
          <div className="brand brand--footer">
            <span className="brand__mark" aria-hidden="true"><span>E</span></span>
            <span className="brand__titles">
              <span className="brand__name">NEWS</span>
              <span className="brand__tagline">THE INDEPENDENT JOURNAL</span>
            </span>
          </div>
          <p className="site-footer__mission">
            Authoritative reporting on diplomacy, technological sovereignty, capital markets, and fine culture. Built for discerning readers across the globe.
          </p>
          <div className="site-footer__pledge">
            <span className="pledge-dot" aria-hidden="true" />
            <span>Ethical, subscriber-first journalism with zero algorithmic bias.</span>
          </div>
          {socials.length ? (
            <ul className="socials" aria-label="Social media channels">
              {socials.map((s) => (
                <li key={s.label}>
                  <a href={s.href} rel="noopener noreferrer" target="_blank" aria-label={s.label}>
                    <Icon name={s.icon} size={18} />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <nav aria-label="Quick links" className="site-footer__col">
          <h2 className="footer-heading">Chronicle</h2>
          <ul>
            {FOOTER_LINKS.quick.map((l) => (
              <li key={l.href}><Link href={l.href}>{l.label}</Link></li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Categories" className="site-footer__col">
          <h2 className="footer-heading">Desks</h2>
          <ul>
            {CATEGORY_SHORTCUTS.map((c) => (
              <li key={c.slug}><Link href={`/category/${c.slug}`}>{c.name}</Link></li>
            ))}
          </ul>
        </nav>

        <div className="site-footer__col">
          <h2 className="footer-heading">Newsroom</h2>
          <ul>
            <li><Link href="/contact">Editorial Inquiries</Link></li>
            <li><Link href="/about">Standards &amp; Corrections</Link></li>
            <li><Link href="/newsletter">The Executive Briefing</Link></li>
            {contactEmail ? <li><a href={`mailto:${contactEmail}`}>{contactEmail}</a></li> : null}
          </ul>
        </div>
      </div>

      <div className="container site-footer__legal">
        <p>&copy; {new Date().getFullYear()} {brand}. All rights reserved. Global Edition.</p>
        <ul>
          {FOOTER_LINKS.legal.map((l) => (
            <li key={l.href}><Link href={l.href}>{l.label}</Link></li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
