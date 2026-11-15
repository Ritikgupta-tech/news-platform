import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="stack">
      <span className="visually-hidden">Loading…</span>
      <Skeleton style={{ height: 28, width: "30%" }} />
      <Skeleton style={{ height: 320 }} />
      <Skeleton style={{ height: 20, width: "80%" }} />
      <Skeleton style={{ height: 20, width: "60%" }} />
    </div>
  );
}
