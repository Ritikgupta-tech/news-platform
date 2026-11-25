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
  if (site === "cross-site") {
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

  const rawHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (rawHost) {
    const firstHost = rawHost.split(",")[0];
    const host = (firstHost ? firstHost.trim() : rawHost.trim()).toLowerCase();
    const rawProto = req.headers.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    const firstProto = rawProto.split(",")[0];
    const proto = (firstProto ? firstProto.trim() : "https").toLowerCase();
    allowedOrigins.add(`${proto}://${host}`);

    // If request Origin has the exact same host as our host header, it is same-origin
    if (origin) {
      try {
        const originUrl = new URL(origin);
        if (originUrl.host.toLowerCase() === host) {
          allowedOrigins.add(originUrl.origin.toLowerCase());
        }
      } catch {}
    }
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
