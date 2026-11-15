import { ApiError } from "@/lib/api/errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence for cookie-authenticated requests: state-changing methods must come from our own origin.
 * Browsers always send Origin on cross-origin POST/PATCH/DELETE, and Sec-Fetch-Site as a fallback.
 * Combined with SameSite=Lax cookies this blocks classic CSRF without per-form tokens.
 */
export function assertSameOrigin(req: Request, appUrl: string): void {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return;
  const allowed = new URL(appUrl).origin;
  const origin = req.headers.get("origin");
  if (origin) {
    if (origin === allowed) return;
    throw blocked();
  }
  const site = req.headers.get("sec-fetch-site");
  if (site === "same-origin") return;
  throw blocked();
}

const blocked = () => new ApiError(403, "FORBIDDEN", "Cross-site request blocked");
