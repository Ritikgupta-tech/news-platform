import type { Metadata } from "next";
import { PreferencesForm } from "@/components/reader/PreferencesForm";
import { can } from "@/lib/permissions";
import { requirePageAccess } from "@/server/auth/page-guard";
import { listCategories } from "@/server/categories/service";
import { getDeps } from "@/server/container";
import { getPreferences, MAX_INTERESTS } from "@/server/reader/preferences";

export const metadata: Metadata = { title: "Preferences", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PreferencesPage() {
  const access = await requirePageAccess("/preferences", "bookmark:manage_own");
  if ("denied" in access) return access.denied;
  const deps = getDeps();
  const [categories, prefs] = await Promise.all([listCategories(deps, access.ctx, false), getPreferences(deps, access.ctx.id)]);
  return (
    <div className="stack">
      <h1>Preferences</h1>
      <PreferencesForm
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        initial={{ interests: prefs.interests.map((i) => i.id), editorialNotifications: prefs.editorialNotifications, recordReadingHistory: prefs.recordReadingHistory }}
        maxInterests={MAX_INTERESTS}
        canReceiveEditorial={can(access.ctx.roles, "article:submit") || can(access.ctx.roles, "article:review")}
      />
    </div>
  );
}
