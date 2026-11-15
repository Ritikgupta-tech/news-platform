import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import type { Deps } from "@/server/container";

export const prefsSchema = z.object({
  /** In-app notifications about editorial events (submitted, approved, published...). Security alerts are always sent. */
  editorialNotifications: z.boolean().default(true),
  /** Keep a private reading history. Turning it off stops recording; existing history stays until you clear it. */
  recordReadingHistory: z.boolean().default(true),
});
export type Prefs = z.infer<typeof prefsSchema>;

/** Always returns a complete object: missing or malformed stored data falls back to the defaults. */
export function readPrefs(raw: unknown): Prefs {
  const parsed = prefsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : prefsSchema.parse({});
}

export const MAX_INTERESTS = 12;

export const updatePreferencesSchema = z.object({
  interests: z.array(z.string().uuid()).max(MAX_INTERESTS).optional(),
  editorialNotifications: z.boolean().optional(),
  recordReadingHistory: z.boolean().optional(),
});
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

export interface PreferencesDto extends Prefs { interests: { id: string; slug: string; name: string }[] }

export async function getPreferences(deps: Deps, userId: string): Promise<PreferencesDto> {
  const u = await deps.db.user.findUniqueOrThrow({
    where: { id: userId }, select: { preferences: true, interests: { select: { id: true, slug: true, name: true }, orderBy: { sortOrder: "asc" } } },
  });
  return { ...readPrefs(u.preferences), interests: u.interests };
}

export async function updatePreferences(deps: Deps, userId: string, input: UpdatePreferencesInput): Promise<PreferencesDto> {
  const ids = input.interests ? [...new Set(input.interests)] : undefined;
  if (ids) {
    const found = await deps.db.category.count({ where: { id: { in: ids }, isActive: true } });
    if (found !== ids.length) throw new ApiError(422, "VALIDATION_ERROR", "One or more interests are unknown or inactive", [{ path: "interests", message: "Unknown category" }]);
  }
  await deps.db.$transaction(async (tx) => {
    const current = readPrefs((await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { preferences: true } })).preferences);
    const next: Prefs = {
      editorialNotifications: input.editorialNotifications ?? current.editorialNotifications,
      recordReadingHistory: input.recordReadingHistory ?? current.recordReadingHistory,
    };
    await tx.user.update({ where: { id: userId }, data: { preferences: next, ...(ids ? { interests: { set: ids.map((id) => ({ id })) } } : {}) } });
  });
  return getPreferences(deps, userId);
}
