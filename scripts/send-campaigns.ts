/** One-shot run of the newsletter sender: `npm run job:send-campaigns` (cron or systemd timer). Needs DATABASE_URL, APP_URL, the JWT secrets (for unsubscribe links) and the MAIL_* settings. */
import { createPrismaClient } from "../src/lib/db";
import { getEnv } from "../src/lib/env";
import { createMailer } from "../src/server/mail/mailer";
import { sendDueCampaigns } from "../src/server/newsletter/sender";

async function main() {
  const db = createPrismaClient();
  try {
    const result = await sendDueCampaigns({ db, env: getEnv(), mailer: createMailer(), now: () => new Date() });
    console.log(JSON.stringify(result));
    process.exitCode = result.aborted ? 1 : 0;
  } finally {
    await db.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
