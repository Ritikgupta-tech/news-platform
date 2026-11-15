import { timingSafeEqual } from "node:crypto";
import { ApiError, Errors } from "@/lib/api/errors";
import { sha256 } from "@/server/auth/tokens";
import type { Deps } from "@/server/container";

const same = (a: string, b: string) => timingSafeEqual(Buffer.from(sha256(a)), Buffer.from(sha256(b)));

/** Shared guard for /api/v1/internal/jobs/*. Disabled (404) unless CRON_SECRET is set; otherwise needs `Authorization: Bearer <secret>`. */
export function requireCronAuth(deps: Deps, req: Request): void {
  const secret = deps.env.CRON_SECRET;
  if (!secret) throw Errors.notFound("Resource");
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ") || !same(header.slice(7), secret)) throw new ApiError(401, "UNAUTHENTICATED", "Invalid job credentials");
}
