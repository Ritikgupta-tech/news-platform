import type { ReactNode } from "react";

export function Badge({ tone = "accent", children }: { tone?: "accent" | "breaking" | "neutral" | "success" | "warning"; children: ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}
