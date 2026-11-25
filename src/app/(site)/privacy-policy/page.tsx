import type { Metadata } from "next";
import Link from "next/link";
import { siteUrl } from "@/lib/site";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Privacy Policy & Reader Data Sovereignty | The Independent Journal",
  description:
    "Our privacy policy outlines our commitment to reader privacy: zero tracking ad networks, opt-in reading history, self-service data export, and full GDPR compliance.",
  alternates: { canonical: absoluteUrl("/privacy-policy", siteUrl()) },
};

export default function PrivacyPolicyPage() {
  return (
    <article className="legal-editorial-page">
      <header className="legal-masthead">
        <span className="legal-masthead__crest" aria-hidden="true">✦</span>
        <span className="legal-masthead__eyebrow">READER PRIVACY &amp; DATA SOVEREIGNTY</span>
        <h1 className="legal-masthead__title">Privacy Policy</h1>
        <p className="legal-masthead__meta">
          Effective: November 2026 · Version 3.2 · Global English Edition
        </p>
      </header>

      <div className="legal-content">
        <section className="legal-section">
          <h2>1. Fundamental Principles</h2>
          <p>
            At <em>The Independent Journal</em>, we believe that intellectual freedom requires reading privacy. We do not sell,
            rent, or monetize reader profiles, nor do we partner with third-party behavioral advertising networks or programmatic ad exchanges.
          </p>
        </section>

        <section className="legal-section">
          <h2>2. Information We Collect</h2>
          <p>We collect only the information necessary to provide our reporting and reader membership services:</p>
          <ul>
            <li>
              <strong>Account Information:</strong> When you register, we collect your name, email address, password hash
              (stored using modern Argon2id cryptographic hashing), and preferred timezone.
            </li>
            <li>
              <strong>Reading History &amp; Bookmarks:</strong> Synced reading history and saved dispatches are stored exclusively
              for your convenience. You may disable reading history or clear it completely at any time from your{" "}
              <Link href="/preferences">Preferences</Link> page.
            </li>
            <li>
              <strong>Editorial Briefings:</strong> When you subscribe to <em>The Executive Briefing</em>, we collect your email
              via verified double opt-in. Every briefing includes a one-click unsubscribe mechanism.
            </li>
            <li>
              <strong>Aggregated Telemetry:</strong> Article view counts and trending signals are aggregated anonymously. We do
              not log or store raw IP addresses alongside reading activity.
            </li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>3. Cookies &amp; Local Storage</h2>
          <p>
            We use strictly necessary first-party cookies for secure authentication sessions, CSRF token verification, and
            editorial desk preferences. We do not place third-party tracking cookies or social network beacons on your device.
          </p>
        </section>

        <section className="legal-section">
          <h2>4. Reader Sovereignty &amp; Data Rights (GDPR &amp; CCPA)</h2>
          <p>
            Regardless of your geographic jurisdiction, we extend full data sovereignty to all registered readers:
          </p>
          <ul>
            <li><strong>Right to Portability:</strong> Download a full machine-readable JSON archive of your account profile, bookmarks, and dispatches via <Link href="/profile">Account Settings</Link>.</li>
            <li><strong>Right to Erasure:</strong> Permanently erase your account, sessions, and reading history with a single confirmation.</li>
            <li><strong>Session Revocation:</strong> Terminate all active sessions on other devices instantly from your security dashboard.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>5. Contact the Privacy Bureau</h2>
          <p>
            For privacy inquiries, audit questions, or regulatory communications, please reach out to our Standards &amp; Privacy Officer
            via our <Link href="/contact">newsroom contact portal</Link>.
          </p>
        </section>
      </div>
    </article>
  );
}
