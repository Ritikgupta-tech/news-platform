import type { PrismaClient } from "@prisma/client";
import { getDb } from "@/lib/db";
import { getEnv, type Env } from "@/lib/env";
import { getMailer, type Mailer } from "@/server/mail/mailer";

/** Everything a service needs. Services receive this explicitly so tests can inject a test database and mailer. */
export interface Deps {
  db: PrismaClient;
  env: Env;
  mailer: Mailer;
  now: () => Date;
}

export function getDeps(): Deps {
  return { db: getDb(), env: getEnv(), mailer: getMailer(), now: () => new Date() };
}
