import type { Metadata } from "next";
import { StateMessage } from "@/components/ui/StateMessage";
import { contactEmail } from "@/lib/site";
export const metadata: Metadata = { title: "Contact", alternates: { canonical: "/contact" } };

export default function Contact() {
  const email = contactEmail();
  return (
    <section className="narrow prose" aria-labelledby="h">
      <h1 id="h">Contact</h1>
      <p>Send news tips, corrections and general enquiries to the newsroom.</p>
      {email ? <p><a href={`mailto:${email}`}>{email}</a></p> : <StateMessage kind="empty" title="Contact address not configured">The site owner has not set a contact email yet.</StateMessage>}
    </section>
  );
}
