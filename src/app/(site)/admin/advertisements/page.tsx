import type { Metadata } from "next";
import { AdvertisementManager } from "@/components/admin/AdvertisementManager";
import { requirePageAccess } from "@/server/auth/page-guard";
import { listAdvertisements } from "@/server/advertisements/service";
import { getDeps } from "@/server/container";

export const metadata: Metadata = { title: "Advertisements", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminAdvertisements() {
  const access = await requirePageAccess("/admin/advertisements", "ads:manage");
  if ("denied" in access) return access.denied;
  const ads = await listAdvertisements(getDeps(), access.ctx, undefined, true);
  return (
    <div className="stack">
      <div className="page-head">
        <h1>Advertisements & Campaigns</h1>
        <p className="muted">
          Manage promotional banners and sponsored placements across the homepage, sidebars and feeds.
        </p>
      </div>
      <AdvertisementManager advertisements={ads} />
    </div>
  );
}
