import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";
interface Common { variant?: Variant; size?: "sm" | "md"; children: ReactNode; className?: string }

const cls = (v: Variant, s: string, extra?: string) => ["btn", `btn--${v}`, `btn--${s}`, extra].filter(Boolean).join(" ");

export function Button({ variant = "primary", size = "md", className, children, type = "button", ...rest }: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={cls(variant, size, className)} {...rest}>{children}</button>;
}

export function ButtonLink({ variant = "primary", size = "md", className, children, href }: Common & { href: string }) {
  return <Link href={href} className={cls(variant, size, className)}>{children}</Link>;
}
