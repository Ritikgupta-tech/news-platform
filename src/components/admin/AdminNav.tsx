"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { can, type PermissionKey } from "@/lib/permissions";

interface NavItem {
  href: string;
  label: string;
  permission: PermissionKey;
  icon: IconName;
}

const ITEMS: NavItem[] = [
  { href: "/admin", label: "Dashboard", permission: "analytics:view_all", icon: "dashboard" },
  { href: "/admin/articles", label: "Articles", permission: "article:edit_any", icon: "fileText" },
  { href: "/admin/analytics", label: "Analytics", permission: "analytics:view_all", icon: "chart" },
  { href: "/admin/authors", label: "Authors", permission: "analytics:view_all", icon: "user" },
  { href: "/admin/featured", label: "Homepage", permission: "featured:manage", icon: "home" },
  { href: "/admin/categories", label: "Categories", permission: "category:manage", icon: "folder" },
  { href: "/admin/tags", label: "Tags", permission: "tag:manage", icon: "tag" },
  { href: "/admin/comments", label: "Comments", permission: "comment:moderate", icon: "messageSquare" },
  { href: "/admin/newsletters", label: "Newsletter", permission: "newsletter:manage", icon: "mail" },
  { href: "/admin/advertisements", label: "Advertisements", permission: "ads:manage", icon: "megaphone" },
  { href: "/admin/users", label: "Users", permission: "user:manage", icon: "users" },
  { href: "/admin/settings", label: "Settings", permission: "settings:manage", icon: "settings" },
  { href: "/admin/audit-logs", label: "Audit log", permission: "audit:view", icon: "shield" },
];

/** Shows only the sections the signed-in person may use. Every page and API checks permission independently. */
export function AdminNav({ roles }: { roles: readonly string[] }) {
  const current = usePathname() ?? "/admin";
  const items = ITEMS.filter((i) => can(roles, i.permission));
  if (!items.length) return null;

  return (
    <nav className="admin-nav-container" aria-label="Administration">
      <div className="admin-nav__track">
        {items.map((i) => {
          const isActive = current === i.href || (i.href !== "/admin" && current.startsWith(i.href));
          return (
            <Link
              key={i.href}
              href={i.href}
              className={`admin-nav__item ${isActive ? "admin-nav__item--active" : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon name={i.icon} size={15} />
              <span>{i.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
