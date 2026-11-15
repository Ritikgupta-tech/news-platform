import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin/AdminNav";
import { getAuthContext } from "@/server/auth/current-user";

export const dynamic = "force-dynamic";

/** Shell for every /admin page. Pages still enforce their own permission; the nav only hides links. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const ctx = await getAuthContext();
  return (
    <div className="stack">
      {ctx ? <AdminNav roles={ctx.roles} /> : null}
      {children}
    </div>
  );
}
