import type { Metadata } from "next";
export const metadata: Metadata = { title: "Terms and conditions", alternates: { canonical: "/terms" } };

export default function Terms() {
  return (
    <section className="narrow prose" aria-labelledby="h">
      <p className="draft-note" role="note">Draft template. Have qualified legal counsel review and complete these terms before launch.</p>
      <h1 id="h">Terms and conditions</h1>
      <h2>Use of the site</h2>
      <p>Content is provided for general information. You agree not to misuse the service or attempt to disrupt it.</p>
      <h2>Intellectual property</h2>
      <p>Articles, images and design are protected by copyright. Do not republish without permission.</p>
      <h2>Comments</h2>
      <p>Comments are moderated and may be removed if they are abusive, unlawful or off topic.</p>
    </section>
  );
}
