import type { Metadata } from "next";
import { HomepageManager } from "@/components/admin/HomepageManager";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/server/auth/page-guard";
import { getDeps } from "@/server/container";
import { getHomepageConfig, SLOT_LIMITS } from "@/server/homepage/service";

export const metadata: Metadata = { title: "Homepage", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminFeatured() {
  const access = await requirePageAccess("/admin/featured", "featured:manage");
  if ("denied" in access) return access.denied;
  const cfg = await getHomepageConfig(getDeps(), access.ctx);
  const row = (a: { id: string; title: string; live: boolean }) => ({ id: a.id, title: a.title, live: a.live });
  return (
    <div className="stack">
      <div className="page-head"><h1>Homepage</h1><p className="muted">Choose which stories lead the homepage and edit the promotional banner. Changes go live when you save them.</p></div>
      <HomepageManager
        slots={{ HERO: cfg.slots.HERO.map(row), FEATURED: cfg.slots.FEATURED.map(row) }}
        candidates={cfg.candidates.map(row)} limits={SLOT_LIMITS}
        promo={cfg.promo ?? null} canManagePromo={can(access.ctx.roles, "homepage:manage")}
      />
    </div>
  );
}
