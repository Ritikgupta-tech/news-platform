import { z } from "zod";
import { writeAudit } from "@/server/audit/audit";
import type { AuthContext } from "@/server/auth/guard";
import { requirePermission } from "@/server/auth/guard";
import type { Deps } from "@/server/container";

export const siteSettingsSchema = z.object({
  siteName: z.string().trim().min(2).max(60).default("E News"),
  tagline: z.string().trim().max(160).default("Independent, verified reporting on world affairs, business and technology."),
  contactEmail: z.string().trim().email().default("contact@enews.media"),
  defaultTimezone: z.string().trim().min(2).max(40).default("UTC"),
  allowRegistration: z.boolean().default(true),
  commentsEnabled: z.boolean().default(true),
  commentsRequireAuth: z.boolean().default(true),
  requireEditorialReview: z.boolean().default(true),
  breakingNewsTicker: z.boolean().default(true),
  analyticsRetentionDays: z.number().int().min(7).max(730).default(90),
});

export type SiteSettings = z.infer<typeof siteSettingsSchema>;

const SETTINGS_KEY = "system.settings";

export const DEFAULT_SETTINGS: SiteSettings = {
  siteName: "E News",
  tagline: "Independent, verified reporting on world affairs, business and technology.",
  contactEmail: "contact@enews.media",
  defaultTimezone: "UTC",
  allowRegistration: true,
  commentsEnabled: true,
  commentsRequireAuth: true,
  requireEditorialReview: true,
  breakingNewsTicker: true,
  analyticsRetentionDays: 90,
};

export async function getSiteSettings(deps: Deps): Promise<SiteSettings> {
  const row = await deps.db.siteSetting.findUnique({ where: { key: SETTINGS_KEY } });
  if (!row || typeof row.value !== "object" || row.value === null) {
    return DEFAULT_SETTINGS;
  }
  const parsed = siteSettingsSchema.safeParse(row.value);
  return parsed.success ? parsed.data : { ...DEFAULT_SETTINGS, ...row.value };
}

export async function updateSiteSettings(
  deps: Deps,
  ctx: AuthContext,
  patch: Partial<SiteSettings>
): Promise<SiteSettings> {
  requirePermission(ctx, "settings:manage");
  const current = await getSiteSettings(deps);
  const updated = siteSettingsSchema.parse({ ...current, ...patch });

  await deps.db.$transaction(async (tx) => {
    await tx.siteSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, value: updated },
      update: { value: updated },
    });
    await writeAudit(tx, {
      actorId: ctx.id,
      action: "settings.update",
      entityType: "SiteSetting",
      entityId: SETTINGS_KEY,
      metadata: { keysChanged: Object.keys(patch) },
    });
  });

  return updated;
}
