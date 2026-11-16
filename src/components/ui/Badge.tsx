import type { ReactNode } from "react";

export function Badge({
  tone = "accent",
  children,
  className,
}: {
  tone?: "accent" | "breaking" | "neutral" | "success" | "warning" | "gold" | "live";
  children: ReactNode;
  className?: string;
}) {
  const classes = ["badge", `badge--${tone}`, className].filter(Boolean).join(" ");
  return <span className={classes}>{children}</span>;
}
