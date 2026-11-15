"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { can, type PermissionKey } from "@/lib/permissions";

const ITEMS: { href: string; label: string; permission: PermissionKey }[] = [
  { href: "/admin", label: "Dashboard", permission: "analytics:view_all" },
  { href: "/admin/articles", label: "Articles", permission: "article:edit_any" },
  { href: "/admin/analytics", label: "Analytics", permission: "analytics:view_all" },
  { href: "/admin/authors", label: "Authors", permission: "analytics:view_all" },
  { href: "/admin/featured", label: "Homepage", permission: "featured:manage" },
  { href: "/admin/categories", label: "Categories", permission: "category:manage" },
  { href: "/admin/tags", label: "Tags", permission: "tag:manage" },
  { href: "/admin/comments", label: "Comments", permission: "comment:moderate" },
  { href: "/admin/newsletters", label: "Newsletter", permission: "newsletter:manage" },
  { href: "/admin/advertisements", label: "Advertisements", permission: "ads:manage" },
  { href: "/admin/users", label: "Users", permission: "user:manage" },
  { href: "/admin/settings", label: "Settings", permission: "settings:manage" },
  { href: "/admin/audit-logs", label: "Audit log", permission: "audit:view" },
];

/** Shows only the sections the signed-in person may use. This is convenience: every page and API checks permission again. */
export function AdminNav({ roles }: { roles: readonly string[] }) {
  const current = usePathname() ?? "/admin";
  const items = ITEMS.filter((i) => can(roles, i.permission));
  if (!items.length) return null;
  return (
    <nav className="tabs admin-nav" aria-label="Administration">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={current === i.href || (i.href !== "/admin" && current.startsWith(i.href)) ? "page" : undefined}>{i.label}</Link>
      ))}
    </nav>
  );
}
