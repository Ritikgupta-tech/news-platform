import type { PrismaClient } from "@prisma/client";
import { createPrismaClient, setDb } from "../../src/lib/db";
import { seedReferenceData } from "../../src/server/bootstrap/reference-data";

/** Integration tests run only when TEST_DATABASE_URL points at a disposable database. */
export const TEST_DB_URL = process.env.TEST_DATABASE_URL;

export function connect(): PrismaClient {
  if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL not set");
  const client = createPrismaClient(TEST_DB_URL);
  setDb(client);
  return client;
}

/** Wipes every table (never run against a real database) and re-seeds reference data. */
export async function resetDatabase(db: PrismaClient): Promise<void> {
  const rows = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename::text AS tablename FROM pg_tables WHERE schemaname = 'public'`;
  const names = rows.map((r) => `"${r.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
  await seedReferenceData(db);
}

// ───────── factories ─────────
import { RoleName, ArticleStatus } from "@prisma/client";
import { slugify } from "../../src/lib/slug";

let counter = 0;
const uniq = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export async function makeUser(db: PrismaClient, role: RoleName = RoleName.READER, over: { email?: string; name?: string; passwordHash?: string } = {}) {
  const roleRow = await db.role.findUniqueOrThrow({ where: { name: role } });
  const n = uniq();
  const user = await db.user.create({
    data: {
      email: over.email ?? `user-${n}@example.test`,
      name: over.name ?? `Test ${role} ${n}`,
      passwordHash: over.passwordHash ?? "not-a-real-hash",
      emailVerifiedAt: new Date(),
      roles: { create: { roleId: roleRow.id } },
    },
  });
  if (role === RoleName.AUTHOR || role === RoleName.EDITOR) {
    await db.authorProfile.create({ data: { userId: user.id, slug: slugify(`${user.name}`) } });
  }
  return user;
}

export async function makeArticle(
  db: PrismaClient,
  over: { authorId: string; categorySlug?: string; title?: string; status?: ArticleStatus; publishedAt?: Date | null; isBreaking?: boolean; editorBoost?: number },
) {
  const cat = await db.category.findUniqueOrThrow({ where: { slug: over.categorySlug ?? "technology" } });
  const title = over.title ?? `Article ${uniq()}`;
  const status = over.status ?? ArticleStatus.PUBLISHED;
  const body = `Body for ${title}. `.repeat(30);
  return db.article.create({
    data: {
      slug: slugify(title) + "-" + uniq(),
      title,
      summary: `Summary of ${title}`,
      bodyHtml: `<p>${body}</p>`,
      bodyText: body,
      status,
      publishedAt: over.publishedAt === undefined ? (status === "PUBLISHED" ? new Date(Date.now() - 60_000) : null) : over.publishedAt,
      isBreaking: over.isBreaking ?? false,
      editorBoost: over.editorBoost ?? 0,
      authorId: over.authorId,
      categoryId: cat.id,
    },
  });
}

// ───────── service-level helpers ─────────
import { getEnv } from "../../src/lib/env";
import type { Deps } from "../../src/server/container";
import { MemoryMailer } from "../../src/server/mail/mailer";
import { MemoryRateLimiter, setRateLimiter } from "../../src/server/security/rate-limit";
import { toAuthUser, userInclude } from "../../src/server/auth/service";
import type { AuthContext } from "../../src/server/auth/guard";

export interface TestClock { now: Date; advance(ms: number): void }

export function makeDeps(db: PrismaClient, clock?: TestClock): Deps & { mailer: MemoryMailer } {
  return { db, env: getEnv(), mailer: new MemoryMailer(), now: () => (clock ? new Date(clock.now) : new Date()) };
}

export function makeClock(start = new Date()): TestClock {
  const c = { now: start, advance(ms: number) { c.now = new Date(c.now.getTime() + ms); } };
  return c;
}

/** Fresh rate limiter per test so unrelated tests never trip each other's limits. */
export function resetRateLimits(): void { setRateLimiter(new MemoryRateLimiter()); }

/** Builds the caller context from the database, exactly as the guard does (roles are always live). */
export async function ctxFor(db: PrismaClient, userId: string): Promise<AuthContext> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: userInclude });
  return { ...toAuthUser(user), sessionId: "test-session" };
}

let ipCounter = 0;
export const meta = (ip = `10.0.0.${++ipCounter % 250}`) => ({ ip, userAgent: "vitest" });
