import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * Prisma runs with `engineType = "client"` (no native query engine) and the `pg` driver adapter.
 * The client is created lazily so importing this module never needs a database (builds, unit tests).
 */
export function createPrismaClient(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getDb(): PrismaClient {
  globalForPrisma.prisma ??= createPrismaClient();
  return globalForPrisma.prisma;
}

/** Test hook: inject a client bound to a test database. */
export function setDb(client: PrismaClient | undefined): void {
  globalForPrisma.prisma = client;
}

/** Lazy proxy so existing `import { db }` call sites keep working without connecting at import time. */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get: (_target, prop) => Reflect.get(getDb() as object, prop),
});
