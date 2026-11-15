import { z } from "zod";
import { Errors } from "@/lib/api/errors";
import { writeAudit } from "@/server/audit/audit";
import type { AuthContext } from "@/server/auth/guard";
import { requirePermission } from "@/server/auth/guard";
import type { Deps } from "@/server/container";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string) => UUID.test(v);

export const createAdvertisementSchema = z.object({
  placement: z.string().trim().min(1).max(50).default("HOME_PROMO"),
  title: z.string().trim().min(2).max(120),
  imageUrl: z.string().trim().min(1).max(1000),
  linkUrl: z.string().trim().min(1).max(1000),
  isActive: z.boolean().default(true),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
});

export const updateAdvertisementSchema = createAdvertisementSchema.partial();

export type CreateAdvertisementInput = z.infer<typeof createAdvertisementSchema>;
export type UpdateAdvertisementInput = z.infer<typeof updateAdvertisementSchema>;

export interface AdvertisementDto {
  id: string;
  placement: string;
  title: string;
  imageUrl: string;
  linkUrl: string;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

const toDto = (ad: {
  id: string;
  placement: string;
  title: string;
  imageUrl: string;
  linkUrl: string;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}): AdvertisementDto => ({
  id: ad.id,
  placement: ad.placement,
  title: ad.title,
  imageUrl: ad.imageUrl,
  linkUrl: ad.linkUrl,
  isActive: ad.isActive,
  startsAt: ad.startsAt?.toISOString() ?? null,
  endsAt: ad.endsAt?.toISOString() ?? null,
});

export async function listAdvertisements(
  deps: Deps,
  ctx: AuthContext | null,
  placement?: string,
  includeInactive = false
): Promise<AdvertisementDto[]> {
  const showAll = includeInactive && !!ctx && (ctx.roles.includes("ADMIN") || ctx.roles.includes("EDITOR"));
  const now = new Date();
  const where: Record<string, unknown> = {};
  if (placement) where.placement = placement;
  if (!showAll) {
    where.isActive = true;
    where.AND = [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
    ];
  }

  const rows = await deps.db.advertisement.findMany({
    where,
    orderBy: { id: "desc" },
  });
  return rows.map(toDto);
}

export async function getAdvertisement(deps: Deps, id: string): Promise<AdvertisementDto> {
  if (!isUuid(id)) throw Errors.notFound("Advertisement");
  const row = await deps.db.advertisement.findUnique({ where: { id } });
  if (!row) throw Errors.notFound("Advertisement");
  return toDto(row);
}

export async function createAdvertisement(
  deps: Deps,
  ctx: AuthContext,
  input: CreateAdvertisementInput
): Promise<AdvertisementDto> {
  requirePermission(ctx, "ads:manage");
  return await deps.db.$transaction(async (tx) => {
    const row = await tx.advertisement.create({
      data: {
        placement: input.placement,
        title: input.title,
        imageUrl: input.imageUrl,
        linkUrl: input.linkUrl,
        isActive: input.isActive,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
      },
    });
    await writeAudit(tx, {
      actorId: ctx.id,
      action: "advertisement.create",
      entityType: "Advertisement",
      entityId: row.id,
      metadata: { placement: row.placement, title: row.title },
    });
    return toDto(row);
  });
}

export async function updateAdvertisement(
  deps: Deps,
  ctx: AuthContext,
  id: string,
  input: UpdateAdvertisementInput
): Promise<AdvertisementDto> {
  requirePermission(ctx, "ads:manage");
  if (!isUuid(id)) throw Errors.notFound("Advertisement");
  const existing = await deps.db.advertisement.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound("Advertisement");

  return await deps.db.$transaction(async (tx) => {
    const row = await tx.advertisement.update({
      where: { id },
      data: {
        ...(input.placement !== undefined ? { placement: input.placement } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
        ...(input.linkUrl !== undefined ? { linkUrl: input.linkUrl } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.startsAt !== undefined ? { startsAt: input.startsAt ? new Date(input.startsAt) : null } : {}),
        ...(input.endsAt !== undefined ? { endsAt: input.endsAt ? new Date(input.endsAt) : null } : {}),
      },
    });
    await writeAudit(tx, {
      actorId: ctx.id,
      action: "advertisement.update",
      entityType: "Advertisement",
      entityId: row.id,
      metadata: { title: row.title, isActive: row.isActive },
    });
    return toDto(row);
  });
}

export async function deleteAdvertisement(deps: Deps, ctx: AuthContext, id: string): Promise<void> {
  requirePermission(ctx, "ads:manage");
  if (!isUuid(id)) throw Errors.notFound("Advertisement");
  const existing = await deps.db.advertisement.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound("Advertisement");

  await deps.db.$transaction(async (tx) => {
    await tx.advertisement.delete({ where: { id } });
    await writeAudit(tx, {
      actorId: ctx.id,
      action: "advertisement.delete",
      entityType: "Advertisement",
      entityId: id,
      metadata: { title: existing.title },
    });
  });
}
