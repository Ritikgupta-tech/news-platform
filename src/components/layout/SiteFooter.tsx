import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";
import { CATEGORY_SHORTCUTS, FOOTER_LINKS } from "@/config/navigation";

export interface SocialLink { label: string; href: string; icon: IconName }

export function SiteFooter({ brand = "E News", socials = [], contactEmail }: { brand?: string; socials?: SocialLink[]; contactEmail?: string }) {
  return (
    <footer className="site-footer">
      <div className="container site-footer__grid">
        <div className="site-footer__about">
          <p className="brand brand--footer"><span className="brand__mark" aria-hidden="true">E</span><span className="brand__name">{brand.replace(/^E\s?/, "")}</span></p>
          <p>Independent reporting on the stories shaping India and the world, from an editorial team you can hold to account.</p>
          {socials.length ? (
            <ul className="socials" aria-label="Social media">
              {socials.map((s) => (<li key={s.label}><a href={s.href} rel="noopener noreferrer" target="_blank" aria-label={s.label}><Icon name={s.icon} size={18} /></a></li>))}
            </ul>
          ) : null}
        </div>
        <nav aria-label="Quick links">
          <h2>Quick links</h2>
          <ul>{FOOTER_LINKS.quick.map((l) => <li key={l.href}><Link href={l.href}>{l.label}</Link></li>)}</ul>
        </nav>
        <nav aria-label="Categories">
          <h2>Categories</h2>
          <ul>{CATEGORY_SHORTCUTS.map((c) => <li key={c.slug}><Link href={`/category/${c.slug}`}>{c.name}</Link></li>)}</ul>
        </nav>
        <div>
          <h2>Contact</h2>
          <ul>
            <li><Link href="/contact">Contact the newsroom</Link></li>
            {contactEmail ? <li><a href={`mailto:${contactEmail}`}>{contactEmail}</a></li> : null}
          </ul>
        </div>
      </div>
      <div className="container site-footer__legal">
        <p>&copy; {new Date().getFullYear()} {brand}. All rights reserved.</p>
        <ul>{FOOTER_LINKS.legal.map((l) => <li key={l.href}><Link href={l.href}>{l.label}</Link></li>)}</ul>
      </div>
    </footer>
  );
}
