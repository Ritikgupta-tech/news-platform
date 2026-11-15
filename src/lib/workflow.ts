import { ApiError, Errors } from "./api/errors";

export const ARTICLE_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "IN_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHED",
  "ARCHIVED",
] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

interface Rule {
  to: ArticleStatus;
  /** Roles allowed to perform this transition. */
  roles: readonly string[];
}

const STAFF = ["EDITOR", "ADMIN"] as const;
const WRITERS = ["AUTHOR", "EDITOR", "ADMIN"] as const;

/** The single source of truth for allowed transitions. Enforced server-side only. */
export const TRANSITIONS: Record<ArticleStatus, readonly Rule[]> = {
  DRAFT: [{ to: "SUBMITTED", roles: WRITERS }],
  SUBMITTED: [{ to: "IN_REVIEW", roles: STAFF }],
  IN_REVIEW: [
    { to: "CHANGES_REQUESTED", roles: STAFF },
    { to: "APPROVED", roles: STAFF },
    { to: "ARCHIVED", roles: STAFF }, // rejection (recorded as an EditorialReview with decision REJECTED)
  ],
  CHANGES_REQUESTED: [{ to: "SUBMITTED", roles: WRITERS }],
  APPROVED: [
    { to: "SCHEDULED", roles: STAFF },
    { to: "PUBLISHED", roles: STAFF },
  ],
  SCHEDULED: [
    { to: "PUBLISHED", roles: STAFF }, // also used by the scheduler job (system actor)
    { to: "APPROVED", roles: STAFF }, // cancel schedule
  ],
  PUBLISHED: [{ to: "ARCHIVED", roles: STAFF }],
  ARCHIVED: [],
};

export interface Actor {
  roles: readonly string[];
  /** AuthorProfile.canPublishDirectly: an explicit grant that lets an author skip review. */
  canPublishDirectly?: boolean;
}

export function canTransition(from: ArticleStatus, to: ArticleStatus, actor: Actor): boolean {
  if (
    actor.canPublishDirectly &&
    actor.roles.includes("AUTHOR") &&
    from === "DRAFT" &&
    to === "PUBLISHED"
  ) {
    return true;
  }
  return TRANSITIONS[from].some((r) => r.to === to && r.roles.some((role) => actor.roles.includes(role)));
}

export function assertTransition(from: ArticleStatus, to: ArticleStatus, actor: Actor): void {
  if (!canTransition(from, to, actor)) throw Errors.invalidTransition(from, to);
}

/** Optimistic concurrency: reject a write made against a stale version. */
export function assertVersion(current: number, expected: number): void {
  if (current !== expected) throw Errors.versionConflict(current);
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}
