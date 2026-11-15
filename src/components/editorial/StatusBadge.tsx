import { Badge } from "@/components/ui/Badge";

const MAP: Record<string, { label: string; tone: "accent" | "breaking" | "neutral" | "success" | "warning" }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SUBMITTED: { label: "Submitted", tone: "warning" },
  IN_REVIEW: { label: "In review", tone: "warning" },
  CHANGES_REQUESTED: { label: "Changes requested", tone: "breaking" },
  APPROVED: { label: "Approved", tone: "accent" },
  SCHEDULED: { label: "Scheduled", tone: "accent" },
  PUBLISHED: { label: "Published", tone: "success" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
};

export function StatusBadge({ status }: { status: string }) {
  const m = MAP[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}
