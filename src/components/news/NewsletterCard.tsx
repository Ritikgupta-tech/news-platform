"use client";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Posts to POST /api/v1/newsletter/subscribe (double opt-in).
 * Luxury Executive Briefing redesign with gold crest accents.
 */
export function NewsletterCard({ endpoint = "/api/v1/newsletter/subscribe" }: { endpoint?: string }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) return setStatus({ kind: "error", message: "Please enter a valid email address." });
    if (!consent) return setStatus({ kind: "error", message: "Please acknowledge the newsletter dispatch policy." });
    setStatus({ kind: "submitting" });
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), consent: true }),
      });
      const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
      if (res.ok) return setStatus({ kind: "success", message: "Subscription requested. Please check your inbox to confirm." });
      if (res.status === 409) return setStatus({ kind: "error", message: "This email address is already subscribed." });
      if (res.status === 422 || res.status === 400) return setStatus({ kind: "error", message: body?.error?.message ?? "Please check your details and try again." });
      return setStatus({ kind: "error", message: "Service temporarily unavailable. Please try again later." });
    } catch {
      setStatus({ kind: "error", message: "Network error. Please try again." });
    }
  }

  return (
    <section className="newsletter newsletter--executive" aria-labelledby={`${id}-h`}>
      <div className="newsletter__glow" aria-hidden="true" />
      <div className="newsletter__header">
        <div className="newsletter__crest" aria-hidden="true">
          <Icon name="sparkles" size={24} />
        </div>
        <div className="newsletter__copy">
          <span className="newsletter__eyebrow">THE EXECUTIVE BRIEFING</span>
          <h2 id={`${id}-h`}>Global Intelligence Delivered to Your Morning Read</h2>
          <p>
            An unhurried, rigorous analysis of global power shifts, emerging technologies, capital markets, and fine culture. Delivered every dawn.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} noValidate className="newsletter__form">
        <div className="newsletter__row">
          <label htmlFor={`${id}-email`} className="visually-hidden">Email address</label>
          <div className="newsletter__input-wrap">
            <Icon name="mail" size={18} className="newsletter__input-icon" />
            <input
              id={`${id}-email`}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="Enter your professional email..."
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby={`${id}-status`}
            />
          </div>
          <Button type="submit" variant="primary" className="btn--gold-solid" disabled={status.kind === "submitting"}>
            {status.kind === "submitting" ? "Enrolling…" : "Join The Briefing"}
          </Button>
        </div>

        <label className="check">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>I agree to receive the morning executive dispatch. Zero spam. Unsubscribe at any time.</span>
        </label>

        <p id={`${id}-status`} aria-live="polite" className={`form-status form-status--${status.kind}`}>
          {status.kind === "error" || status.kind === "success" ? status.message : ""}
        </p>
      </form>
    </section>
  );
}
