import type { Metadata } from "next";
import { SettingsManager } from "@/components/admin/SettingsManager";
import { requirePageAccess } from "@/server/auth/page-guard";
import { getSiteSettings } from "@/server/settings/service";
import { getDeps } from "@/server/container";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminSettings() {
  const access = await requirePageAccess("/admin/settings", "settings:manage");
  if ("denied" in access) return access.denied;
  const settings = await getSiteSettings(getDeps());
  return (
    <div className="stack">
      <div className="page-head">
        <h1>Site & Platform Settings</h1>
        <p className="muted">
          Configure publication identity, registration access, editorial peer-review enforcement, and community moderation rules.
        </p>
      </div>
      <SettingsManager initialSettings={settings} />
    </div>
  );
}
