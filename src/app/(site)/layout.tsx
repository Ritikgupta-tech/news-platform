import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { getCurrentUser } from "@/server/auth/current-user";
import { getDeps } from "@/server/container";
import { listNotifications } from "@/server/notifications/service";
import { contactEmail } from "@/lib/site";
import type { NotificationItem } from "@/types/news";

export const dynamic = "force-dynamic";

async function loadNotifications(userId: string | undefined): Promise<NotificationItem[]> {
  if (!userId) return [];
  try {
    const { items } = await listNotifications(getDeps(), userId, { page: 1, pageSize: 10, unreadOnly: "false" });
    return items.map((n) => ({ id: n.id, title: n.title, createdAt: n.createdAt, read: n.read, href: n.href }));
  } catch {
    return []; // the header must never break a page
  }
}

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const notifications = await loadNotifications(user?.id);
  return (
    <>
      <SiteHeader user={user} notifications={notifications} />
      <main id="main" className="container page">{children}</main>
      <SiteFooter contactEmail={contactEmail()} />
    </>
  );
}
