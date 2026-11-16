import { ApiError } from "@/lib/api/errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence for cookie-authenticated requests: state-changing methods must come from our own origin.
 * Browsers always send Origin on cross-origin POST/PATCH/DELETE, and Sec-Fetch-Site as a fallback.
 * Combined with SameSite=Lax cookies this blocks classic CSRF without per-form tokens.
 */
export function assertSameOrigin(req: Request, appUrl: string): void {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return;

  const origin = req.headers.get("origin");
  const site = req.headers.get("sec-fetch-site");

  // Modern browsers send Sec-Fetch-Site; if explicitly cross-site, immediately block
  if (site && site !== "same-origin" && site !== "same-site") {
    throw blocked();
  }

  // Resolve all valid same-origin targets
  const allowedOrigins = new Set<string>();

  try {
    if (appUrl) allowedOrigins.add(new URL(appUrl).origin.toLowerCase());
  } catch {}

  try {
    if (req.url) allowedOrigins.add(new URL(req.url).origin.toLowerCase());
  } catch {}

  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (host) {
    const proto = req.headers.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    allowedOrigins.add(`${proto}://${host}`.toLowerCase());
  }

  if (origin) {
    const normOrigin = origin.toLowerCase();
    // Allow if origin matches configured app URL, request URL, host header, or browser verified same-origin
    if (normOrigin !== "null" && (allowedOrigins.has(normOrigin) || site === "same-origin")) {
      return;
    }
    throw blocked();
  }

  if (site === "same-origin") return;

  throw blocked();
}

const blocked = () => new ApiError(403, "FORBIDDEN", "Cross-site request blocked");
