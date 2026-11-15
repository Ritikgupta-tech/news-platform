/**
 * DEVELOPMENT seed. Fake data only; refuses to run in production.
 * Usage: SEED_DEV_PASSWORD=... npx prisma db seed
 */
import { RoleName, ArticleStatus } from "@prisma/client";
import { createPrismaClient } from "../src/lib/db";
import { hash } from "@node-rs/argon2";
import { seedReferenceData } from "../src/server/bootstrap/reference-data";
import { slugify } from "../src/lib/slug";
import { readingMinutes } from "../src/lib/reading-time";

const db = createPrismaClient();


const DEV_USERS = [
  { email: "admin@example.test", name: "Dev Admin", role: RoleName.ADMIN },
  { email: "editor@example.test", name: "Dev Editor", role: RoleName.EDITOR },
  { email: "author@example.test", name: "Dev Author", role: RoleName.AUTHOR },
  { email: "reader@example.test", name: "Dev Reader", role: RoleName.READER },
];

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production");
  const password = process.env.SEED_DEV_PASSWORD;
  if (!password || password.length < 12) throw new Error("Set SEED_DEV_PASSWORD (min 12 chars) to seed dev users");

  await seedReferenceData(db);

  // Users
  const passwordHash = await hash(password);
  for (const u of DEV_USERS) {
    const user = await db.user.upsert({
      where: { email: u.email },
      update: {},
      create: { email: u.email, name: u.name, passwordHash, emailVerifiedAt: new Date() },
    });
    const role = await db.role.findUniqueOrThrow({ where: { name: u.role } });
    await db.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
    if (u.role === RoleName.AUTHOR || u.role === RoleName.EDITOR) {
      await db.authorProfile.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id, slug: slugify(u.name), bio: "Development seed author." },
      });
    }
  }

  // A few clearly-labelled dev articles so the UI has something to render.
  const author = await db.user.findUniqueOrThrow({ where: { email: "author@example.test" } });
  const cats = await db.category.findMany({ where: { slug: { in: ["technology", "business", "health", "sports"] } } });
  for (const c of cats) {
    const title = `[DEV SEED] Sample ${c.name} story`;
    const text = "This is development seed content, not real news. ".repeat(40);
    await db.article.upsert({
      where: { slug: slugify(title) },
      update: {},
      create: {
        slug: slugify(title),
        title,
        summary: `Development seed article for ${c.name}.`,
        bodyHtml: `<p>${text}</p>`,
        bodyText: text,
        readingMinutes: readingMinutes(text),
        status: ArticleStatus.PUBLISHED,
        publishedAt: new Date(),
        authorId: author.id,
        categoryId: c.id,
      },
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
