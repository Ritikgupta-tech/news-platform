import type { Metadata } from "next";
import Link from "next/link";
import { contactEmail, siteUrl } from "@/lib/site";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Contact The Independent Journal | Editorial Bureau & Inquiries",
  description:
    "Direct contact channels for The Independent Journal newsroom, confidential tips, subscriber support, and corporate licensing.",
  alternates: { canonical: absoluteUrl("/contact", siteUrl()) },
};

export default function Contact() {
  const email = contactEmail() || "newsroom@independentjournal.com";

  return (
    <div className="contact-editorial-page">
      <header className="contact-masthead">
        <span className="contact-masthead__crest" aria-hidden="true">✦</span>
        <span className="contact-masthead__eyebrow">EDITORIAL INQUIRIES &amp; SECURE DISPATCHES</span>
        <h1 className="contact-masthead__title">Contact The Independent Journal</h1>
        <p className="contact-masthead__lead">
          Connect directly with our editors, investigative reporters, subscriber support desk, and corporate licensing bureau.
        </p>
      </header>

      <div className="contact-grid">
        <div className="contact-card contact-card--featured">
          <div className="contact-card__badge">CONFIDENTIAL BUREAU</div>
          <h2 className="contact-card__title">Confidential News Tips &amp; Whistleblowers</h2>
          <p>
            We take source protection seriously. If you have non-public documents, verifiable evidence of corruption, or
            sensitive investigative material:
          </p>
          <ul className="contact-details-list">
            <li><strong>Encrypted Signal:</strong> Available upon editorial vetting</li>
            <li><strong>PGP Fingerprint:</strong> Verified editorial key available on request</li>
            <li><strong>Secure Drop:</strong> For confidential leak delivery without metadata</li>
          </ul>
          <p className="contact-card__action">
            <a href={`mailto:tips@${email.split("@")[1] || "independentjournal.com"}`} className="btn btn--gold btn--sm">
              Submit a Confidential Tip
            </a>
          </p>
        </div>

        <div className="contact-card">
          <h2 className="contact-card__title">Editorial Newsroom &amp; Corrections</h2>
          <p>
            Letters to the Editor, queries regarding factual corrections, or feedback on published dispatches:
          </p>
          <ul className="contact-details-list">
            <li><strong>Letters to Editor:</strong> letters@{email.split("@")[1] || "independentjournal.com"}</li>
            <li><strong>Standards Editor:</strong> standards@{email.split("@")[1] || "independentjournal.com"}</li>
          </ul>
          <p className="contact-card__action">
            <a href={`mailto:${email}`} className="btn btn--secondary btn--sm">
              Email the Newsroom
            </a>
          </p>
        </div>

        <div className="contact-card">
          <h2 className="contact-card__title">Subscriber &amp; Membership Concierge</h2>
          <p>
            For inquiries regarding Digital Standard, Executive All-Access, account access, or invoice billing:
          </p>
          <ul className="contact-details-list">
            <li><strong>Self-Service:</strong> Manage directly in <Link href="/profile">Account Settings</Link></li>
            <li><strong>Membership Desk:</strong> membership@{email.split("@")[1] || "independentjournal.com"}</li>
          </ul>
          <p className="contact-card__action">
            <Link href="/subscribe" className="btn btn--secondary btn--sm">
              Explore Subscriptions
            </Link>
          </p>
        </div>

        <div className="contact-card">
          <h2 className="contact-card__title">Corporate Syndication &amp; API Feeds</h2>
          <p>
            For institutional newsrooms, financial terminals, academic institutions, and content syndication licensing:
          </p>
          <ul className="contact-details-list">
            <li><strong>Enterprise Licensing:</strong> enterprise@{email.split("@")[1] || "independentjournal.com"}</li>
            <li><strong>Reprint Permissions:</strong> syndication@{email.split("@")[1] || "independentjournal.com"}</li>
          </ul>
          <p className="contact-card__action">
            <a href={`mailto:enterprise@${email.split("@")[1] || "independentjournal.com"}`} className="btn btn--secondary btn--sm">
              Inquire Corporate Access
            </a>
          </p>
        </div>
      </div>

      <div className="contact-bureaus-section">
        <h3 className="bureaus-title">Global Editorial Bureaus</h3>
        <div className="bureaus-grid">
          <div className="bureau-card">
            <strong>London Bureau</strong>
            <span>Fleet Street Financial Quarter</span>
            <span className="muted">Europe &amp; African Markets</span>
          </div>
          <div className="bureau-card">
            <strong>Washington Bureau</strong>
            <span>National Press Building</span>
            <span className="muted">Americas &amp; Federal Policy</span>
          </div>
          <div className="bureau-card">
            <strong>Singapore Bureau</strong>
            <span>Marina Bay Financial Centre</span>
            <span className="muted">Asia-Pacific Trade &amp; Tech</span>
          </div>
          <div className="bureau-card">
            <strong>Geneva Bureau</strong>
            <span>Palais des Nations District</span>
            <span className="muted">Multilateral Treaties &amp; Climate</span>
          </div>
        </div>
      </div>
    </div>
  );
}
