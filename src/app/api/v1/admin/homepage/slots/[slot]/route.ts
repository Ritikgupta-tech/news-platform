import { Errors } from "@/lib/api/errors";
import { ok, route } from "@/lib/api/response";
import { readJson } from "@/lib/api/request";
import { requireAuth } from "@/server/auth/guard";
import { getDeps } from "@/server/container";
import { setSlot, setSlotSchema, slotSchema } from "@/server/homepage/service";

export const dynamic = "force-dynamic";

export const PUT = route<{ params: Promise<{ slot: string }> }>(async (req, { params }) => {
  const deps = getDeps();
  const slot = slotSchema.safeParse((await params).slot.toUpperCase());
  if (!slot.success) throw Errors.notFound("Slot");
  const ctx = await requireAuth(deps, req);
  const { articleIds } = await readJson(req, setSlotSchema);
  return ok(await setSlot(deps, ctx, slot.data, articleIds));
});
