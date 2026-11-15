import type { Metadata } from "next";
import { RankedList } from "@/components/news/RankedList";
import { StateMessage } from "@/components/ui/StateMessage";
import { getContent } from "@/lib/content";

export const metadata: Metadata = { title: "Trending", description: "Stories gaining the most attention right now.", alternates: { canonical: "/trending" } };

export default async function TrendingPage() {
  const items = await getContent().listTrending(20);
  return (
    <section aria-labelledby="h" className="narrow">
      <div className="page-head"><h1 id="h">Trending now</h1><p className="muted">Ranked by recent unique readers, engagement and freshness.</p></div>
      {items.length === 0 ? <StateMessage kind="empty" title="Nothing trending yet">Trending stories appear once readers start engaging with new articles.</StateMessage> : <div className="panel"><RankedList items={items} label="Trending articles" /></div>}
    </section>
  );
}
