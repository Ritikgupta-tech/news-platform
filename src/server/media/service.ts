import { z } from "zod";
import { ApiError, Errors } from "@/lib/api/errors";
import { can } from "@/lib/permissions";
import { writeAudit } from "@/server/audit/audit";
import { requirePermission, type AuthContext } from "@/server/auth/guard";
import type { Deps } from "@/server/container";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { sniffImage } from "./sniff";
import { getMediaStorage, type MediaStorage } from "./storage";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const UPLOADS_PER_HOUR = 30;

export const mediaMetaSchema = z.object({
  altText: z.string().trim().min(3, "Describe the image for readers who cannot see it (at least 3 characters)").max(200),
  caption: z.string().trim().max(300).optional(),
  credit: z.string().trim().max(120).optional(),
});

export interface MediaDto { id: string; url: string; mimeType: string; width: number | null; height: number | null; sizeBytes: number; altText: string; caption: string | null; credit: string | null }
const toDto = (m: { id: string; url: string; mimeType: string; width: number | null; height: number | null; sizeBytes: number; altText: string; caption: string | null; credit: string | null }): MediaDto => ({
  id: m.id, url: m.url, mimeType: m.mimeType, width: m.width, height: m.height, sizeBytes: m.sizeBytes, altText: m.altText, caption: m.caption, credit: m.credit,
});

/** Validates the bytes themselves (type, size, pixel dimensions), stores them, then records the asset. */
export async function uploadMedia(deps: Deps, ctx: AuthContext, file: Uint8Array, meta: z.infer<typeof mediaMetaSchema>, storage: MediaStorage = getMediaStorage()): Promise<MediaDto> {
  requirePermission(ctx, "article:create");
  await enforceRateLimit(`media:${ctx.id}`, UPLOADS_PER_HOUR, 3_600_000);
  if (file.byteLength === 0) throw new ApiError(422, "VALIDATION_ERROR", "The file is empty");
  if (file.byteLength > MAX_UPLOAD_BYTES) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Images can be at most 5 MB");
  const info = sniffImage(file);
  if (!info) throw new ApiError(422, "VALIDATION_ERROR", "Upload a JPEG, PNG or WebP image (up to 12,000 px on a side)");

  const storageKey = `${crypto.randomUUID()}.${info.ext}`;
  await storage.put(storageKey, file);
  try {
    return await deps.db.$transaction(async (tx) => {
      const row = await tx.mediaAsset.create({
        data: { storageKey, url: `/media/${storageKey}`, mimeType: info.mime, sizeBytes: file.byteLength, width: info.width, height: info.height, altText: meta.altText, caption: meta.caption || null, credit: meta.credit || null, uploadedBy: ctx.id },
      });
      await writeAudit(tx, { actorId: ctx.id, action: "media.upload", entityType: "MediaAsset", entityId: row.id, metadata: { mime: info.mime, bytes: file.byteLength } });
      return toDto(row);
    });
  } catch (e) {
    await storage.delete(storageKey).catch(() => undefined); // do not leave an orphan file behind
    throw e;
  }
}

/** The uploader or an editor/admin may delete. An image still used as an article's hero image cannot be deleted. */
export async function deleteMedia(deps: Deps, ctx: AuthContext, id: string, storage: MediaStorage = getMediaStorage()): Promise<void> {
  const asset = await deps.db.mediaAsset.findFirst({ where: { id, deletedAt: null } });
  if (!asset || (asset.uploadedBy !== ctx.id && !can(ctx.roles, "article:edit_any"))) throw Errors.notFound("Image"); // hides other people's uploads
  const used = await deps.db.article.count({ where: { heroImageId: id, deletedAt: null } });
  if (used > 0) throw Errors.conflict(`This image is used by ${used} article(s). Remove it from them first.`);
  await deps.db.$transaction(async (tx) => {
    await tx.mediaAsset.update({ where: { id }, data: { deletedAt: deps.now() } });
    await writeAudit(tx, { actorId: ctx.id, action: "media.delete", entityType: "MediaAsset", entityId: id });
  });
  await storage.delete(asset.storageKey);
}
