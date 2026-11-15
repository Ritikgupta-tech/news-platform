export const ROLES = ["READER", "AUTHOR", "EDITOR", "ADMIN"] as const;
export type RoleKey = (typeof ROLES)[number];

export const PERMISSIONS = [
  "article:read",
  "article:create",
  "article:edit_own",
  "article:edit_any",
  "article:submit",
  "article:review",
  "article:publish",
  "article:archive",
  "article:delete",
  "category:manage",
  "tag:manage",
  "featured:manage",
  "homepage:manage",
  "comment:create",
  "comment:moderate",
  "bookmark:manage_own",
  "newsletter:manage",
  "ads:manage",
  "analytics:view_own",
  "analytics:view_all",
  "user:manage",
  "audit:view",
  "settings:manage",
] as const;
export type PermissionKey = (typeof PERMISSIONS)[number];

const READER: PermissionKey[] = ["article:read", "comment:create", "bookmark:manage_own"];
const AUTHOR: PermissionKey[] = [
  ...READER,
  "article:create",
  "article:edit_own",
  "article:submit",
  "analytics:view_own",
];
const EDITOR: PermissionKey[] = [
  ...AUTHOR,
  "article:edit_any",
  "article:review",
  "article:publish",
  "article:archive",
  "category:manage",
  "tag:manage",
  "featured:manage",
  "homepage:manage",
  "comment:moderate",
  "analytics:view_all",
];
const ADMIN: PermissionKey[] = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<RoleKey, readonly PermissionKey[]> = {
  READER,
  AUTHOR,
  EDITOR: [...new Set(EDITOR)],
  ADMIN,
};

export function can(roles: readonly string[], permission: PermissionKey): boolean {
  return roles.some((r) => (ROLE_PERMISSIONS as Record<string, readonly PermissionKey[]>)[r]?.includes(permission));
}
