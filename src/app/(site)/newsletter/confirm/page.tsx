import type { Metadata } from "next";
import { NewsletterTokenAction } from "@/components/news/NewsletterTokenAction";
import { StateMessage } from "@/components/ui/StateMessage";

export const metadata: Metadata = { title: "Confirm your subscription", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <section className="narrow" aria-labelledby="h">
      <div className="page-head"><h1 id="h">Confirm your subscription</h1></div>
      {token && token.length <= 300 ? <NewsletterTokenAction kind="verify" token={token} /> : <StateMessage kind="error" title="This link is incomplete">Open the link from your email again.</StateMessage>}
    </section>
  );
}
