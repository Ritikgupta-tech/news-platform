import { hashPassword } from "../../src/server/auth/password";
import type { PrismaClient } from "@prisma/client";
import { makeUser } from "./helpers";
import * as loginRoute from "../../src/app/api/v1/auth/login/route";

export const ORIGIN = "http://localhost:3000";
export const PW = "correct horse battery staple";

/** Browser-like cookie jar: honours Path scoping and Max-Age=0 deletion, so cookie-visibility bugs cannot hide. */
export class Jar {
  private store = new Map<string, { name: string; value: string; path: string }>();
  update(res: Response): this {
    for (const raw of res.headers.getSetCookie()) {
      const [pair = "", ...attrs] = raw.split(";").map((x) => x.trim());
      const i = pair.indexOf("=");
      const name = pair.slice(0, i);
      const value = decodeURIComponent(pair.slice(i + 1));
      const path = attrs.find((a) => /^path=/i.test(a))?.slice(5) ?? "/";
      const maxAge = attrs.find((a) => /^max-age=/i.test(a));
      const key = `${name}|${path}`;
      if (maxAge && Number(maxAge.split("=")[1]) <= 0) this.store.delete(key);
      else this.store.set(key, { name, value, path });
    }
    return this;
  }
  set(name: string, value: string, path = "/") { this.store.set(`${name}|${path}`, { name, value, path }); }
  get(name: string): string | undefined { return [...this.store.values()].find((c) => c.name === name)?.value; }
  has(name: string): boolean { return this.get(name) !== undefined; }
  /** Cookie header a browser would send for a request to `requestPath`. */
  header(requestPath: string): string {
    const path = requestPath.split("?")[0]!;
    return [...this.store.values()]
      .filter((c) => c.path === "/" || path === c.path || path.startsWith(c.path + "/"))
      .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
      .join("; ");
  }
}

interface CallOpts { body?: unknown; cookie?: string | Jar; origin?: string | null; headers?: Record<string, string>; ip?: string }
export const call = (handler: (req: Request, ctx: never) => Promise<Response>, method: string, path: string, o: CallOpts = {}, ctx: unknown = {}) => {
  const headers: Record<string, string> = { ...(o.headers ?? {}) };
  if (o.origin !== null) headers["origin"] = o.origin ?? ORIGIN;
  const cookie = o.cookie instanceof Jar ? o.cookie.header(path) : o.cookie;
  if (cookie) headers["cookie"] = cookie;
  if (o.body !== undefined) headers["content-type"] = "application/json";
  return handler(new Request(`${ORIGIN}${path}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) }), ctx as never);
};
export const rawCookies = (res: Response) => res.headers.getSetCookie();
export const params = <T>(p: T) => ({ params: Promise.resolve(p) });

/** Creates a user with a known password and signs in through the real login route. */
export async function signInAs(db: PrismaClient, role: "READER" | "AUTHOR" | "EDITOR" | "ADMIN", email = `${role.toLowerCase()}@example.test`, name?: string) {
  const user = await makeUser(db, role, { email, name, passwordHash: await hashPassword(PW) });
  const res = await call(loginRoute.POST, "POST", "/api/v1/auth/login", { body: { email, password: PW } });
  if (res.status !== 200) throw new Error(`login failed: ${res.status}`);
  return { user, cookie: new Jar().update(res) };
}
