import type { Metadata } from "next";
import Link from "next/link";
import { siteUrl } from "@/lib/site";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "About The Independent Journal | Editorial Charter & Standards",
  description:
    "Learn about The Independent Journal: our editorial charter, verification standards, investigative mission, and sovereign reader-supported model.",
  alternates: { canonical: absoluteUrl("/about", siteUrl()) },
};

export default function About() {
  return (
    <article className="about-editorial-page">
      <header className="about-masthead">
        <span className="about-masthead__crest" aria-hidden="true">✦</span>
        <span className="about-masthead__eyebrow">EDITORIAL CHARTER &amp; PRINCIPLES</span>
        <h1 className="about-masthead__title">About The Independent Journal</h1>
        <p className="about-masthead__lead">
          A sovereign publication dedicated to rigorous reporting, global economic intelligence, and intellectual clarity.
          We believe that democracy and free markets depend on truth reported without fear or favor.
        </p>
      </header>

      <div className="about-grid">
        <section className="about-card">
          <h2 className="about-card__title">Our Sovereign Mission</h2>
          <p>
            Founded on the conviction that independent journalism is a pillar of open societies, The Independent Journal
            provides unhurried, meticulous dispatches on international statecraft, capital markets, scientific breakthroughs,
            and cultural currents.
          </p>
          <p>
            In an era of hyper-accelerated soundbites and engagement algorithms, we produce deep-seated investigative work
            that withstands historical scrutiny.
          </p>
        </section>

        <section className="about-card">
          <h2 className="about-card__title">Verification &amp; Standards</h2>
          <p>
            Every dispatch undergoes multiple layers of rigorous editorial verification before publication:
          </p>
          <ul className="about-standards-list">
            <li><strong>Two-Source Corroboration:</strong> Factual assertions require multiple independent confirmations.</li>
            <li><strong>Named Attribution:</strong> Anonymous sourcing is reserved strictly for whistleblowers facing grave reprisal.</li>
            <li><strong>Distinction of Voice:</strong> Factual news reportage is strictly separated from analysis, editorial commentary, and opinion.</li>
            <li><strong>Transparent Corrections:</strong> Any necessary amendment is publicly logged with an explicit timestamp and explanation.</li>
          </ul>
        </section>

        <section className="about-card">
          <h2 className="about-card__title">Editorial Independence</h2>
          <p>
            Our publication is sustained primarily by readers through sovereign subscriptions. We do not accept native advertising,
            sponsored content masquerading as reporting, or commercial entanglements that compromise news judgment.
          </p>
          <p>
            Editorial decisions are made solely by our editorial board and bureau chiefs. Discover our{" "}
            <Link href="/subscribe" className="link--gold">membership tiers</Link> to support independent reporting.
          </p>
        </section>

        <section className="about-card">
          <h2 className="about-card__title">Global Newsroom Desks</h2>
          <div className="about-desks-grid">
            <div className="desk-item">
              <strong>World Affairs:</strong> Diplomacy, treaties, geopolitical conflict, and multilateral governance.
            </div>
            <div className="desk-item">
              <strong>Markets &amp; Commerce:</strong> Global macroeconomics, central bank policy, sovereign debt, and energy commodities.
            </div>
            <div className="desk-item">
              <strong>Technology &amp; Frontiers:</strong> Artificial intelligence, quantum infrastructure, biotechnology, and cybersecurity.
            </div>
            <div className="desk-item">
              <strong>Culture &amp; Architecture:</strong> Sustainable cities, living spaces, literary arts, and international heritage.
            </div>
          </div>
        </section>
      </div>

      <div className="about-footer-callout">
        <h3>Connect with the Newsroom</h3>
        <p>
          Have a news tip, confidential dispatch, or query for the Standards Editor?{" "}
          <Link href="/contact" className="link--gold">
            Reach our editorial team directly →
          </Link>
        </p>
      </div>
    </article>
  );
}
