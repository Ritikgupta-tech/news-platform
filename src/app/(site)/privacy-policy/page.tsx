import type { Metadata } from "next";
export const metadata: Metadata = { title: "Privacy policy", alternates: { canonical: "/privacy-policy" } };

export default function Privacy() {
  return (
    <section className="narrow prose" aria-labelledby="h">
      <p className="draft-note" role="note">Draft template. Have qualified legal counsel review and complete this policy before launch.</p>
      <h1 id="h">Privacy policy</h1>
      <h2>What we collect</h2>
      <p>Account details you provide (name, email), reading preferences you set, and limited analytics that count unique daily readers without storing raw IP addresses.</p>
      <h2>Newsletter</h2>
      <p>We send the newsletter only to people who have given consent and confirmed their email address. Every email contains an unsubscribe link.</p>
      <h2>Your rights</h2>
      <p>You can export or delete your account data from your profile settings once you are signed in.</p>
      <h2>Contact</h2>
      <p>Questions about this policy can be sent through the <a href="/contact">contact page</a>.</p>
    </section>
  );
}
