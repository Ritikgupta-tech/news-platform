import { z } from "zod";
import { isValidTimeZone } from "@/lib/timezone";

export const ACTIONS = ["submit", "start-review", "request-changes", "approve", "reject", "publish", "schedule", "cancel-schedule", "archive"] as const;
export type EditorialAction = (typeof ACTIONS)[number];

const version = z.number().int().min(1);
const reason = z.string().trim().min(10, "Please give a reason of at least 10 characters").max(2000);

const scheduleSchema = z
  .object({
    version,
    /** Absolute instant with an explicit offset, e.g. 2026-12-01T09:30:00+05:30 or ...Z */
    scheduledFor: z.string().datetime({ offset: true }).optional(),
    /** Or a wall-clock time plus the editor's IANA timezone */
    localDateTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Use YYYY-MM-DDTHH:mm").optional(),
    timezone: z.string().max(64).refine(isValidTimeZone, "Unknown timezone").optional(),
  })
  .refine((v) => Boolean(v.scheduledFor) !== Boolean(v.localDateTime && v.timezone), "Provide scheduledFor, or localDateTime together with timezone");

export const actionSchemas = {
  submit: z.object({ version }),
  "start-review": z.object({ version }),
  "request-changes": z.object({ version, reason }),
  approve: z.object({ version, note: z.string().trim().max(2000).optional() }),
  reject: z.object({ version, reason }),
  publish: z.object({ version }),
  schedule: scheduleSchema,
  "cancel-schedule": z.object({ version }),
  archive: z.object({ version }),
} satisfies Record<EditorialAction, z.ZodTypeAny>;

export const isAction = (v: string): v is EditorialAction => (ACTIONS as readonly string[]).includes(v);
