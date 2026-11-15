import type { CSSProperties } from "react";

/** Decorative loading placeholder. The parent region should set aria-busy. */
export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden="true" />;
}
