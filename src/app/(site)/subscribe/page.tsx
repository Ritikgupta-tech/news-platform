import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/server/auth/current-user";
import { SubscriptionPlans } from "@/components/subscription/SubscriptionPlans";
import { siteUrl } from "@/lib/site";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Subscriptions & Membership | The Independent Journal",
  description:
    "Support uncompromising, independent journalism. Explore Digital Standard, Executive All-Access, and Institutional Newsroom membership tiers.",
  alternates: {
    canonical: absoluteUrl("/subscribe", siteUrl()),
  },
  openGraph: {
    title: "Subscriptions & Membership | The Independent Journal",
    description: "Support uncompromising, independent journalism. Read global investigative reports, market intelligence, and audio dispatches.",
    url: absoluteUrl("/subscribe", siteUrl()),
  },
};

export default async function SubscribePage() {
  const user = await getCurrentUser();

  return (
    <div className="subscribe-page">
      {/* Editorial Page Masthead */}
      <header className="subscribe-masthead">
        <div className="subscribe-masthead__crest" aria-hidden="true">
          <span>✦</span>
        </div>
        <span className="subscribe-masthead__eyebrow">MEMBERSHIP &amp; SUBSCRIPTIONS</span>
        <h1 className="subscribe-masthead__title">
          Invest in Independent, High-Caliber Journalism
        </h1>
        <p className="subscribe-masthead__lead">
          When facts are verified with rigorous integrity, societies thrive. Become a subscriber to unlock
          unrestricted global reporting, continuous market indices, audio investigations, and the morning Executive Briefing.
        </p>
      </header>

      {/* Interactive Plans & Sandbox Staging */}
      <SubscriptionPlans user={user} />

      {/* Detailed Feature Comparison Grid */}
      <section className="subscribe-comparison" aria-labelledby="comparison-heading">
        <div className="comparison-header">
          <span className="eyebrow-tag">EDITION BREAKDOWN</span>
          <h2 id="comparison-heading" className="comparison-title">
            Comprehensive Privilege Matrix
          </h2>
          <p className="comparison-subtitle">
            Compare access privileges and editorial benefits across our publication tiers.
          </p>
        </div>

        <div className="comparison-table-wrap">
          <table className="comparison-table">
            <thead>
              <tr>
                <th scope="col" className="col-privilege">Privilege / Feature</th>
                <th scope="col" className="col-tier">Digital Standard</th>
                <th scope="col" className="col-tier col-tier--featured">Executive All-Access</th>
                <th scope="col" className="col-tier">Institutional</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Unlimited Dispatches &amp; Breaking Alerts</th>
                <td><span className="check-mark">✓</span></td>
                <td className="cell--featured"><span className="check-mark">✓</span></td>
                <td><span className="check-mark">✓</span></td>
              </tr>
              <tr>
                <th scope="row">Daily Morning Executive Briefing</th>
                <td><span className="check-mark">✓</span></td>
                <td className="cell--featured"><span className="check-mark">✓</span></td>
                <td><span className="check-mark">✓</span></td>
              </tr>
              <tr>
                <th scope="row">Cross-Device Reading History &amp; Bookmarks</th>
                <td><span className="check-mark">✓</span></td>
                <td className="cell--featured"><span className="check-mark">✓</span></td>
                <td><span className="check-mark">✓</span></td>
              </tr>
              <tr>
                <th scope="row">100% Ad-Free Editorial Reading</th>
                <td><span className="dash-mark">—</span></td>
                <td className="cell--featured"><span className="check-mark">✓</span></td>
                <td><span className="check-mark">✓</span></td>
              </tr>
              <tr>
                <th scope="row">Executive Audio Editions &amp; Spoken Reports</th>
                <td><span className="dash-mark">—</span></td>
                <td className="cell--featured"><span className="check-mark">✓</span></td>
                <td><span className="check-mark">✓</span></td>
              </tr>
              <tr>
                <th scope="row">10-Year Deep Digitized Newsroom Archives</th>
                <td><span className="dash-mark">—</span></td>
                <td className="cell--featured"><span className="check-mark">✓</span></td>
                <td><span className="check-mark">✓</span></td>
              </tr>
              <tr>
                <th scope="row">Quarterly Economic &amp; Geopolitical Symposium</th>
                <td><span className="dash-mark">—</span></td>
                <td className="cell--featured"><span className="check-mark">✓</span></td>
                <td><span className="check-mark">✓</span></td>
              </tr>
              <tr>
                <th scope="row">Concurrent Team Logins</th>
                <td>1 Reader</td>
                <td className="cell--featured">1 Reader</td>
                <td>Up to 10 Seats</td>
              </tr>
              <tr>
                <th scope="row">API News Webhook Feed &amp; Redistribution</th>
                <td><span className="dash-mark">—</span></td>
                <td className="cell--featured"><span className="dash-mark">—</span></td>
                <td><span className="check-mark">✓</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Frequently Asked Questions */}
      <section className="subscribe-faq" aria-labelledby="faq-heading">
        <div className="faq-header">
          <span className="eyebrow-tag">CLARITY &amp; POLICIES</span>
          <h2 id="faq-heading" className="faq-title">Frequently Asked Questions</h2>
        </div>

        <div className="faq-grid">
          <div className="faq-card">
            <h3 className="faq-card__q">Can I modify or cancel my subscription at any time?</h3>
            <p className="faq-card__a">
              Yes. You can alter or cancel your membership with one click directly from your{" "}
              <Link href="/profile">Account Settings</Link> page. Cancellations take effect at the conclusion of
              your current billing cycle without penalty.
            </p>
          </div>

          <div className="faq-card">
            <h3 className="faq-card__q">How does the Sandbox / Demonstration Mode function?</h3>
            <p className="faq-card__a">
              In this environment, payment processing via Stripe or LemonSqueezy is staged in sandbox demonstration
              mode. Selecting a plan simulates the subscription state without charging real payment instruments, allowing
              complete end-to-end evaluation.
            </p>
          </div>

          <div className="faq-card">
            <h3 className="faq-card__q">Do you offer institutional, corporate, or academic licensing?</h3>
            <p className="faq-card__a">
              Yes. Our Institutional Newsroom tier supports corporate seats, academic institutions, and enterprise
              research organizations. For custom IP whitelisting or enterprise invoicing, please{" "}
              <Link href="/contact">contact our corporate licensing team</Link>.
            </p>
          </div>

          <div className="faq-card">
            <h3 className="faq-card__q">What is your policy on reader privacy and tracking?</h3>
            <p className="faq-card__a">
              The Independent Journal maintains strict privacy standards. We do not sell reader data or monetize
              personal reading profiles. Review our comprehensive{" "}
              <Link href="/privacy-policy">Privacy Policy</Link> for details.
            </p>
          </div>
        </div>
      </section>

      {/* Editorial Assistance Callout */}
      <div className="subscribe-contact-callout">
        <p>
          Have questions regarding subscriptions, corporate invoicing, or technical access?{" "}
          <Link href="/contact" className="link--gold">
            Inquire with the Newsroom Concierge
          </Link>
        </p>
      </div>
    </div>
  );
}
