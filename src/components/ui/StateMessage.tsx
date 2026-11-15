import type { ReactNode } from "react";

/** Shared empty / error / unauthorized state block. */
export function StateMessage({ kind, title, children, action, as: Heading = "h3" }: { kind: "empty" | "error" | "unauthorized"; title: string; children?: ReactNode; action?: ReactNode; as?: "h1" | "h2" | "h3" }) {
  return (
    <div className={`state state--${kind}`} role={kind === "error" ? "alert" : "status"}>
      <Heading>{title}</Heading>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}
