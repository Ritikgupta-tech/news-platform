"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import type { SessionUser } from "@/types/news";

interface Props {
  user: SessionUser | null;
}

interface Tier {
  id: string;
  name: string;
  tagline: string;
  monthlyPrice: number;
  annualPrice: number;
  featured?: boolean;
  features: string[];
  badge?: string;
  buttonLabel: string;
}

const TIERS: Tier[] = [
  {
    id: "standard",
    name: "Digital Standard",
    tagline: "Essential independent global reporting and daily market briefs.",
    monthlyPrice: 12,
    annualPrice: 120,
    features: [
      "Unlimited digital access on web & mobile",
      "Daily Morning Executive Briefing newsletter",
      "Saved stories & reading history synchronization",
      "Standard comment & discussion participation",
      "Full access to the 30-day recent dispatch archive",
    ],
    buttonLabel: "Select Digital Standard",
  },
  {
    id: "executive",
    name: "Executive All-Access",
    tagline: "Uncompromised investigative intelligence, audio journalism, and zero ads.",
    monthlyPrice: 28,
    annualPrice: 280,
    featured: true,
    badge: "MOST POPULAR · EDITORIAL PICK",
    features: [
      "Everything included in Digital Standard",
      "100% Ad-free reading across all editorial desks",
      "Executive audio edition & spoken investigative pieces",
      "Full unrestricted access to 10-year digital archives",
      "Quarterly Economic & Geopolitical Symposium invites",
      "Priority editorial desk dispatches & market signals",
    ],
    buttonLabel: "Select Executive All-Access",
  },
  {
    id: "institutional",
    name: "Institutional Newsroom",
    tagline: "Complete intelligence solution for enterprise teams, research desks, and funds.",
    monthlyPrice: 85,
    annualPrice: 850,
    features: [
      "Everything in Executive All-Access for up to 10 seats",
      "Real-time API dispatch webhook feed",
      "Corporate reprint & syndication redistribution rights",
      "Dedicated editorial liaison & research concierge",
      "Consolidated monthly invoicing & billing management",
      "Custom IP-range or domain authentication support",
    ],
    buttonLabel: "Select Institutional Newsroom",
  },
];

export function SubscriptionPlans({ user }: Props) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("annual");
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [demoSuccess, setDemoSuccess] = useState<string | null>(null);

  const handleSelect = (tier: Tier) => {
    setSelectedTier(tier.id);
    setDemoSuccess(
      `Sandbox Simulation: You have selected the ${tier.name} (${billingCycle === "annual" ? "Annual" : "Monthly"}). In production, this securely redirects to the live payment gateway.`
    );
  };

  return (
    <div className="subscription-container">
      {/* Sandbox Notice Banner */}
      <div className="sandbox-alert-banner" role="status">
        <div className="sandbox-alert-badge">
          <span className="live-dot live-dot--amber" aria-hidden="true" />
          <span>DEMONSTRATION &amp; TEST ENVIRONMENT</span>
        </div>
        <p className="sandbox-alert-text">
          Payment gateway integration (Stripe / LemonSqueezy) is configured in sandbox test mode. No live credit card
          charges are executed. You can safely explore the complete reader membership workflow.
        </p>
      </div>

      {/* Billing Cycle Switcher */}
      <div className="billing-cycle-switch">
        <div className="switch-group" role="radiogroup" aria-label="Billing frequency">
          <button
            type="button"
            role="radio"
            aria-checked={billingCycle === "monthly"}
            className={`cycle-btn ${billingCycle === "monthly" ? "is-active" : ""}`}
            onClick={() => setBillingCycle("monthly")}
          >
            Monthly Billing
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={billingCycle === "annual"}
            className={`cycle-btn ${billingCycle === "annual" ? "is-active" : ""}`}
            onClick={() => setBillingCycle("annual")}
          >
            Annual Billing
            <span className="save-badge">SAVE 20%</span>
          </button>
        </div>
      </div>

      {/* Tier Cards Grid */}
      <div className="subscription-tier-grid">
        {TIERS.map((tier) => {
          const price = billingCycle === "annual" ? tier.annualPrice : tier.monthlyPrice;
          const monthlyEquivalent = billingCycle === "annual" ? Math.round(tier.annualPrice / 12) : tier.monthlyPrice;

          return (
            <div
              key={tier.id}
              className={`tier-card ${tier.featured ? "tier-card--featured" : ""} ${
                selectedTier === tier.id ? "tier-card--selected" : ""
              }`}
            >
              {tier.badge ? <div className="tier-card__crest">{tier.badge}</div> : null}

              <div className="tier-card__head">
                <h3 className="tier-card__title">{tier.name}</h3>
                <p className="tier-card__tagline">{tier.tagline}</p>
              </div>

              <div className="tier-card__pricing">
                <span className="tier-price__currency">$</span>
                <span className="tier-price__amount">{monthlyEquivalent}</span>
                <span className="tier-price__period">/ month</span>
              </div>
              <div className="tier-card__billing-detail">
                {billingCycle === "annual" ? (
                  <span>Billed annually at ${price}/year</span>
                ) : (
                  <span>Billed monthly, cancel anytime</span>
                )}
              </div>

              <hr className="tier-card__divider" />

              <div className="tier-card__features">
                <span className="features-headline">INCLUDED PRIVILEGES</span>
                <ul className="tier-features-list">
                  {tier.features.map((feature, idx) => (
                    <li key={idx} className="tier-feature-item">
                      <span className="check-icon" aria-hidden="true">✓</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="tier-card__action">
                {user ? (
                  <button
                    type="button"
                    className={`btn btn--full ${tier.featured ? "btn--gold" : "btn--secondary"}`}
                    onClick={() => handleSelect(tier)}
                  >
                    {tier.buttonLabel}
                  </button>
                ) : (
                  <Link
                    href={`/register?plan=${tier.id}&billing=${billingCycle}`}
                    className={`btn btn--full ${tier.featured ? "btn--gold" : "btn--secondary"}`}
                  >
                    <span>Create Account &amp; Subscribe</span>
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Interactive Selection Confirmation Feedback */}
      {demoSuccess ? (
        <div className="subscription-feedback-modal" role="status" aria-live="polite">
          <div className="feedback-content">
            <span className="gold-seal" aria-hidden="true">✦</span>
            <h4>Plan Selected: Ready for Gateway Activation</h4>
            <p>{demoSuccess}</p>
            <div className="feedback-actions">
              <Link href="/profile" className="btn btn--secondary btn--sm">
                View Account Profile
              </Link>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setDemoSuccess(null)}
              >
                Dismiss Notice
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
