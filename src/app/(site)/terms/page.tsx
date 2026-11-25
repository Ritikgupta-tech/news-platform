import type { Metadata } from "next";
import Link from "next/link";
import { siteUrl } from "@/lib/site";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Terms of Publication & Civil Discourse | The Independent Journal",
  description:
    "Terms of publication, syndication rights, reader commentary standards, subscription terms, and financial data disclaimers for The Independent Journal.",
  alternates: { canonical: absoluteUrl("/terms", siteUrl()) },
};

export default function TermsPage() {
  return (
    <article className="legal-editorial-page">
      <header className="legal-masthead">
        <span className="legal-masthead__crest" aria-hidden="true">✦</span>
        <span className="legal-masthead__eyebrow">EDITORIAL CHARTER &amp; LEGAL COVENANT</span>
        <h1 className="legal-masthead__title">Terms of Publication</h1>
        <p className="legal-masthead__meta">
          Effective: November 2026 · Version 4.0 · Global Edition
        </p>
      </header>

      <div className="legal-content">
        <section className="legal-section">
          <h2>1. Agreement &amp; Editorial Mission</h2>
          <p>
            By accessing or subscribing to <em>The Independent Journal</em> (&ldquo;the Publication&rdquo;), you enter into a
            binding legal covenant with Ashivam Technologies Ltd. Our mission is to produce uncompromised, fact-checked
            journalism held to the highest standards of international press freedom. These terms govern your use of our
            digital news platform, APIs, RSS feeds, executive audio narrations, and reader accounts.
          </p>
        </section>

        <section className="legal-section">
          <h2>2. Intellectual Property &amp; Syndication</h2>
          <p>
            All original dispatches, investigative reports, photographic journalism, visual graphics, sound recordings, and
            editorial typography published across our desks are the exclusive intellectual property of <em>The Independent Journal</em>{" "}
            and its contributing correspondents.
          </p>
          <ul>
            <li>
              <strong>Fair Use &amp; Quotation:</strong> Brief excerpts of up to 150 words may be quoted in academic, critical,
              or news commentary, provided that prominent attribution and a direct canonical hyperlink to the original dispatch
              are included.
            </li>
            <li>
              <strong>Commercial Syndication:</strong> Systematic crawling, reproduction, framing, translation, or distribution
              of our content without an active Institutional Newsroom license is strictly prohibited.
            </li>
            <li>
              <strong>AI &amp; Model Training:</strong> Automated harvesting of our reporting for the purpose of training
              generative language or multimodal models requires prior written licensing agreements with our syndication desk.
            </li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>3. Reader Commentary &amp; Civil Discourse Standards</h2>
          <p>
            Our comments forum is an intellectual salon for reasoned debate. To maintain editorial dignity:
          </p>
          <ul>
            <li>
              <strong>Moderation Policy:</strong> All comments undergo algorithmic screening and human editorial review before
              publication.
            </li>
            <li>
              <strong>Prohibited Conduct:</strong> We immediately remove and report defamation, hate speech, harassment, doxastic
              threats, commercial spam, impersonation of public officials, and bad-faith disinformation.
            </li>
            <li>
              <strong>Revocation:</strong> Violators will have their commenting privileges permanently revoked without refund of
              subscription balances.
            </li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>4. Subscription Memberships &amp; Demonstration Notice</h2>
          <div className="legal-notice-box">
            <p>
              <strong>Demonstration Environment Notice:</strong> All tiers presented on our{" "}
              <Link href="/subscribe">Membership Tiers</Link> portal (Digital Standard, Executive All-Access, Institutional
              Newsroom) operate in a verified demonstration and development staging mode. Real credit cards are never billed,
              and test orders do not incur financial liabilities until formal production merchant gateways are activated.
            </p>
          </div>
          <p>
            Registered reader accounts allow you to save bookmarks, sync reading history across devices, and manage newsletter
            frequencies. You may cancel your subscription or delete your account at any time via your{" "}
            <Link href="/profile">Account Settings</Link>.
          </p>
        </section>

        <section className="legal-section">
          <h2>5. Financial Market Data Disclaimer</h2>
          <p>
            Market indices, commodity benchmarks, and currency tickers displayed on our platform are provided by Refinitiv and
            consolidated financial data feeds for general informational purposes only. Unless otherwise stated, market data is
            subject to an exchange-mandated 15-minute delay.
          </p>
          <p>
            Neither <em>The Independent Journal</em> nor its data providers provide financial, investment, legal, or tax advice.
            Past performance of indices or corporate securities is no guarantee of future returns. Always consult an authorized
            financial advisor before executing capital transactions.
          </p>
        </section>

        <section className="legal-section">
          <h2>6. Limitation of Liability &amp; Governing Law</h2>
          <p>
            While we exercise rigorous editorial verification, the Publication is provided on an &ldquo;as is&rdquo; and
            &ldquo;as available&rdquo; basis. To the maximum extent permitted by applicable law, Ashivam Technologies Ltd.
            disclaims all implied warranties of merchantability, fitness for a particular purpose, and non-infringement.
          </p>
          <p>
            These Terms are governed by and construed in accordance with the laws of the State of Delaware, United States,
            without regard to conflict of law principles. Any legal proceedings shall be submitted to the exclusive
            jurisdiction of the state and federal courts located in Wilmington, Delaware.
          </p>
        </section>

        <section className="legal-section">
          <h2>7. Legal Bureau Inquiries</h2>
          <p>
            For syndication requests, copyright notices, or formal legal correspondence, please contact our Office of Legal
            Counsel via our <Link href="/contact">newsroom contact conduit</Link> or by email at{" "}
            <a href="mailto:legal@ashivam.com">legal@ashivam.com</a>.
          </p>
        </section>
      </div>
    </article>
  );
}
