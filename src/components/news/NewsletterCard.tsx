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
 * Posts to POST /api/v1/newsletter/subscribe (double opt-in: the success message asks the reader to confirm by email).
 */
export function NewsletterCard({ endpoint = "/api/v1/newsletter/subscribe" }: { endpoint?: string }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) return setStatus({ kind: "error", message: "Enter a valid email address." });
    if (!consent) return setStatus({ kind: "error", message: "Please agree to receive the newsletter." });
    setStatus({ kind: "submitting" });
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), consent: true }),
      });
      const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
      if (res.ok) return setStatus({ kind: "success", message: "Almost done. Check your inbox to confirm your subscription." });
      if (res.status === 409) return setStatus({ kind: "error", message: "This email is already subscribed." });
      if (res.status === 422 || res.status === 400) return setStatus({ kind: "error", message: body?.error?.message ?? "Please check your details and try again." });
      return setStatus({ kind: "error", message: "We couldn’t subscribe you right now. Please try again later." });
    } catch {
      setStatus({ kind: "error", message: "Network error. Please try again." });
    }
  }

  return (
    <section className="newsletter" aria-labelledby={`${id}-h`}>
      <div className="newsletter__icon"><Icon name="mail" size={26} /></div>
      <div className="newsletter__copy">
        <h2 id={`${id}-h`}>Get the day&rsquo;s top stories</h2>
        <p>One concise briefing in your inbox. Unsubscribe any time.</p>
      </div>
      <form onSubmit={onSubmit} noValidate className="newsletter__form">
        <div className="newsletter__row">
          <label htmlFor={`${id}-email`} className="visually-hidden">Email address</label>
          <input id={`${id}-email`} type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-describedby={`${id}-status`} />
          <Button type="submit" disabled={status.kind === "submitting"}>{status.kind === "submitting" ? "Subscribing…" : "Subscribe"}</Button>
        </div>
        <label className="check">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>I agree to receive the E News newsletter and accept the <a href="/privacy-policy">privacy policy</a>.</span>
        </label>
        <p id={`${id}-status`} className={`form-status form-status--${status.kind}`} role="status" aria-live="polite">
          {status.kind === "success" || status.kind === "error" ? status.message : ""}
        </p>
      </form>
    </section>
  );
}
