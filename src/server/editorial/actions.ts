import { can } from "@/lib/permissions";
import type { ArticleStatus } from "@/lib/workflow";
import type { EditorialAction } from "./validation";

export interface ActionActor { id: string; roles: readonly string[]; canPublishDirectly: boolean }
export interface ActionTarget { authorId: string; status: ArticleStatus }

export interface AvailableAction {
  action: EditorialAction;
  label: string;
  /** What extra input the UI must collect before calling the API. */
  input: "none" | "reason" | "note" | "schedule";
  tone: "primary" | "secondary" | "danger";
}

/**
 * The actions this person may offer on this article right now. It mirrors the server rules in
 * editorial/service.ts so the UI only shows buttons that can work; the server remains the authority
 * (a test asserts both agree for every role and status).
 */
export function availableActions(actor: ActionActor, a: ActionTarget): AvailableAction[] {
  const owner = a.authorId === actor.id;
  const canReview = can(actor.roles, "article:review") && !(owner && !actor.roles.includes("ADMIN"));
  const canPublish = can(actor.roles, "article:publish");
  const out: AvailableAction[] = [];
  const s = a.status;

  if ((s === "DRAFT" || s === "CHANGES_REQUESTED") && ((owner && can(actor.roles, "article:submit")) || can(actor.roles, "article:edit_any")))
    out.push({ action: "submit", label: "Submit for review", input: "none", tone: "primary" });
  if (s === "SUBMITTED" && canReview) out.push({ action: "start-review", label: "Start review", input: "none", tone: "primary" });
  if (s === "IN_REVIEW" && canReview) {
    out.push({ action: "approve", label: "Approve", input: "note", tone: "primary" });
    out.push({ action: "request-changes", label: "Request changes", input: "reason", tone: "secondary" });
    out.push({ action: "reject", label: "Reject", input: "reason", tone: "danger" });
  }
  if ((s === "APPROVED" || s === "SCHEDULED") && canPublish) out.push({ action: "publish", label: s === "SCHEDULED" ? "Publish now" : "Publish now", input: "none", tone: "primary" });
  if (s === "DRAFT" && actor.canPublishDirectly && owner && !canPublish) out.push({ action: "publish", label: "Publish now", input: "none", tone: "primary" });
  if (s === "APPROVED" && canPublish) out.push({ action: "schedule", label: "Schedule…", input: "schedule", tone: "secondary" });
  if (s === "SCHEDULED" && canPublish) out.push({ action: "cancel-schedule", label: "Cancel schedule", input: "none", tone: "secondary" });
  if (s === "PUBLISHED" && can(actor.roles, "article:archive")) out.push({ action: "archive", label: "Archive", input: "none", tone: "danger" });
  return out;
}
