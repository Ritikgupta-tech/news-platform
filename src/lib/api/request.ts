import type { z } from "zod";
import { ApiError } from "./errors";

/** Parses a JSON body with a hard size cap, then validates it. Throws ApiError / ZodError (mapped by route()). */
export async function readJson<S extends z.ZodTypeAny>(req: Request, schema: S, maxBytes = 64 * 1024): Promise<z.infer<S>> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body too large");
  const text = await req.text();
  if (Buffer.byteLength(text) > maxBytes) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body too large");
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(422, "VALIDATION_ERROR", "Request body must be valid JSON");
  }
  return schema.parse(raw);
}

export function queryParams(req: Request): Record<string, string> {
  return Object.fromEntries(new URL(req.url).searchParams.entries());
}
