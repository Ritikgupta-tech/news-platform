import { ApiError } from "@/lib/api/errors";
import { created, route } from "@/lib/api/response";
import { requireAuth } from "@/server/auth/guard";
import { getDeps } from "@/server/container";
import { MAX_UPLOAD_BYTES, mediaMetaSchema, uploadMedia } from "@/server/media/service";

export const dynamic = "force-dynamic";

const text = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v : undefined);

/** multipart/form-data: file, altText, caption?, credit?. The file type is decided from its bytes, not its name or declared type. */
export const POST = route(async (req) => {
  const deps = getDeps();
  const ctx = await requireAuth(deps, req);
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Images can be at most 5 MB");
  let form: FormData;
  try { form = await req.formData(); } catch { throw new ApiError(422, "VALIDATION_ERROR", "Send the image as multipart/form-data"); }
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(422, "VALIDATION_ERROR", "Choose an image file");
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Images can be at most 5 MB");
  const meta = mediaMetaSchema.parse({ altText: text(form.get("altText")) ?? "", caption: text(form.get("caption")), credit: text(form.get("credit")) });
  return created(await uploadMedia(deps, ctx, new Uint8Array(await file.arrayBuffer()), meta));
});
