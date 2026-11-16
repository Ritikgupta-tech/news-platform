import type { ReactNode } from "react";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { Icon } from "@/components/ui/Icon";
import { getAuthContext } from "@/server/auth/current-user";

export const dynamic = "force-dynamic";

/** Shell for every /admin page. Pages still enforce their own permission; the nav only hides links. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const ctx = await getAuthContext();
  return (
    <div className="admin-shell">
      {ctx ? (
        <header className="admin-subhead">
          <div className="admin-subhead__brand">
            <div className="admin-subhead__badge">
              <span className="admin-subhead__dot" />
              <span>EDITORIAL CONTROL DESK</span>
              <span className="admin-subhead__divider">/</span>
              <span className="admin-subhead__role">{ctx.roles.join(" · ")}</span>
            </div>
          </div>
          <div className="admin-subhead__actions">
            <Link href="/author/articles/new" className="admin-btn admin-btn--gold">
              <Icon name="plus" size={15} />
              <span>New Article</span>
            </Link>
            <Link href="/" target="_blank" rel="noopener noreferrer" className="admin-btn admin-btn--outline">
              <Icon name="arrowUpRight" size={15} />
              <span>View Frontpage</span>
            </Link>
          </div>
        </header>
      ) : null}

      {ctx ? <AdminNav roles={ctx.roles} /> : null}

      <main className="admin-main">
        {children}
      </main>
    </div>
  );
}
