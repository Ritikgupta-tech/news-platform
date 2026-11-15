/** One-shot run of the scheduler: `npm run job:publish-scheduled` (e.g. from cron or a systemd timer). */
import { createPrismaClient } from "../src/lib/db";
import { publishDueArticles } from "../src/server/editorial/scheduler";
import { ConsoleMailer } from "../src/server/mail/mailer";

async function main() {
  const db = createPrismaClient();
  try {
    const env = { NODE_ENV: "production", DATABASE_URL: process.env.DATABASE_URL ?? "", APP_URL: process.env.APP_URL ?? "http://localhost:3000", JWT_ACCESS_SECRET: "", JWT_REFRESH_SECRET: "", TRUST_PROXY: "0" } as never;
    const result = await publishDueArticles({ db, env, mailer: new ConsoleMailer(false), now: () => new Date() });
    console.log(JSON.stringify(result));
    process.exitCode = result.failed.length ? 1 : 0;
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
