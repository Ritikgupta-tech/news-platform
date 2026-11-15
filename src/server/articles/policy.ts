import { can } from "@/lib/permissions";
import type { ArticleStatus } from "@/lib/workflow";

export interface Actor { id: string; roles: readonly string[] }
export interface ArticleRef { authorId: string; status: ArticleStatus }

/** Statuses in which the author may still edit their own article. */
export const AUTHOR_EDITABLE: readonly ArticleStatus[] = ["DRAFT", "CHANGES_REQUESTED"];

export type EditDecision = { ok: true } | { ok: false; reason: "not_found" | "status" };

/** `not_found` is returned to people who must not learn the article exists (IDOR protection). */
export function decideEdit(actor: Actor, a: ArticleRef): EditDecision {
  if (can(actor.roles, "article:edit_any")) return a.status === "ARCHIVED" ? { ok: false, reason: "status" } : { ok: true };
  if (a.authorId === actor.id && can(actor.roles, "article:edit_own")) {
    return AUTHOR_EDITABLE.includes(a.status) ? { ok: true } : { ok: false, reason: "status" };
  }
  return { ok: false, reason: "not_found" };
}

export function canViewUnpublished(actor: Actor, a: ArticleRef): boolean {
  return a.authorId === actor.id || can(actor.roles, "article:edit_any") || can(actor.roles, "article:review");
}

export type DeleteDecision = { ok: true } | { ok: false; reason: "not_found" | "status" };

export function decideDelete(actor: Actor, a: ArticleRef): DeleteDecision {
  if (can(actor.roles, "article:delete")) return { ok: true };
  if (a.authorId === actor.id && can(actor.roles, "article:edit_own")) return a.status === "DRAFT" ? { ok: true } : { ok: false, reason: "status" };
  return { ok: false, reason: "not_found" };
}
