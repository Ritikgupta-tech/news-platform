// Pure helpers (no Node imports) so the edge middleware can use the cookie names.
export const ACCESS_COOKIE = "enews_at";
export const REFRESH_COOKIE = "enews_rt";
/**
 * Non-secret marker (value "1", Path=/) telling the middleware that a refresh is possible. The real refresh token is
 * scoped to /api/v1/auth, so browsers never send it on page navigations and the middleware could not see it.
 */
export const SESSION_HINT_COOKIE = "enews_sh";
export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
export const REFRESH_COOKIE_PATH = "/api/v1/auth";

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* ignore malformed cookie */
    }
  }
  return out;
}

interface CookieOptions { maxAge: number; path: string; secure: boolean }

function serialize(name: string, value: string, o: CookieOptions): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${o.path}`, `Max-Age=${o.maxAge}`, "HttpOnly", "SameSite=Lax"];
  if (o.secure) parts.push("Secure");
  return parts.join("; ");
}

export function sessionCookies(accessToken: string, refreshToken: string, secure: boolean): string[] {
  return [
    serialize(ACCESS_COOKIE, accessToken, { maxAge: ACCESS_TTL_SECONDS, path: "/", secure }),
    serialize(REFRESH_COOKIE, refreshToken, { maxAge: REFRESH_TTL_SECONDS, path: REFRESH_COOKIE_PATH, secure }),
    serialize(SESSION_HINT_COOKIE, "1", { maxAge: REFRESH_TTL_SECONDS, path: "/", secure }),
  ];
}

export function clearSessionCookies(secure: boolean): string[] {
  return [
    serialize(ACCESS_COOKIE, "", { maxAge: 0, path: "/", secure }),
    serialize(REFRESH_COOKIE, "", { maxAge: 0, path: REFRESH_COOKIE_PATH, secure }),
    serialize(SESSION_HINT_COOKIE, "", { maxAge: 0, path: "/", secure }),
  ];
}
