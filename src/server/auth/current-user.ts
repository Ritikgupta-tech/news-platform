import { cookies } from "next/headers";
import type { SessionUser } from "@/types/news";
import { getDeps } from "@/server/container";
import { ACCESS_COOKIE } from "./cookies";
import { authenticateToken, type AuthContext } from "./guard";

/** Server-component session lookup. Returns null for anonymous visitors and when the database is unreachable. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  try {
    const store = await cookies();
    const ctx = await authenticateToken(getDeps(), store.get(ACCESS_COOKIE)?.value);
    return ctx ? { id: ctx.id, name: ctx.name, email: ctx.email, avatarUrl: ctx.avatarUrl, roles: ctx.roles } : null;
  } catch {
    return null;
  }
}

/** Full caller context for server components (pages that enforce roles). Null when anonymous or the database is unreachable. */
export async function getAuthContext(): Promise<AuthContext | null> {
  try {
    const store = await cookies();
    return await authenticateToken(getDeps(), store.get(ACCESS_COOKIE)?.value);
  } catch {
    return null;
  }
}
