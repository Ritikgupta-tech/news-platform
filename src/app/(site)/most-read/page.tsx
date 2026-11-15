import type { Metadata } from "next";
import { RankedList } from "@/components/news/RankedList";
import { StateMessage } from "@/components/ui/StateMessage";
import { getContent } from "@/lib/content";

export const metadata: Metadata = { title: "Most read", description: "The most-read stories of the past 30 days.", alternates: { canonical: "/most-read" } };

export default async function MostReadPage() {
  const items = await getContent().listMostViewed(20);
  return (
    <section aria-labelledby="h" className="narrow">
      <div className="page-head"><h1 id="h">Most read</h1><p className="muted">Unique daily readers over the last 30 days.</p></div>
      {items.length === 0 ? <StateMessage kind="empty" title="No reading data yet">Rankings appear once articles have been read.</StateMessage> : <div className="panel"><RankedList items={items} label="Most read articles" /></div>}
    </section>
  );
}
