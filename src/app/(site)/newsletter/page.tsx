import type { Metadata } from "next";
import { NewsletterCard } from "@/components/news/NewsletterCard";

export const metadata: Metadata = { title: "Newsletter", description: "Get the day’s top stories in your inbox.", alternates: { canonical: "/newsletter" } };

export default function NewsletterPage() {
  return (
    <section className="narrow" aria-labelledby="h">
      <div className="page-head"><h1 id="h">Newsletter</h1><p className="muted">A concise daily briefing. You can unsubscribe at any time.</p></div>
      <NewsletterCard />
    </section>
  );
}
