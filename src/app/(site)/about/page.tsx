import type { Metadata } from "next";
export const metadata: Metadata = { title: "About", alternates: { canonical: "/about" } };

export default function About() {
  return (
    <section className="narrow prose" aria-labelledby="h">
      <h1 id="h">About E News</h1>
      <p>E News is a digital newsroom covering India and the world across politics, business, technology, science, health, sports, entertainment and more.</p>
      <h2>How we publish</h2>
      <p>Every story is written by a named journalist and reviewed by an editor before it is published. Corrections and updates are marked on the article with an updated date.</p>
      <h2>Contact the newsroom</h2>
      <p>Tips, corrections and feedback are welcome through our <a href="/contact">contact page</a>.</p>
    </section>
  );
}
