import { createPrismaClient } from "../src/lib/db";
import { hashPassword } from "../src/server/auth/password";
import { RoleName } from "@prisma/client";
import { slugify } from "../src/lib/slug";

const db = createPrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL || "admin@ashivam.com";
  const name = "System Administrator";
  const password = process.env.ADMIN_PASSWORD;

  if (!password || password.length < 16) {
    console.error("FATAL: ADMIN_PASSWORD environment variable is required and must be at least 16 characters.");
    process.exit(1);
  }

  console.log(`Setting up Admin account for: ${email}`);
  const passwordHash = await hashPassword(password);

  // 1. Ensure Roles exist
  for (const roleName of Object.values(RoleName)) {
    await db.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });
  }

  const adminRole = await db.role.findUniqueOrThrow({ where: { name: RoleName.ADMIN } });
  const editorRole = await db.role.findUniqueOrThrow({ where: { name: RoleName.EDITOR } });
  const authorRole = await db.role.findUniqueOrThrow({ where: { name: RoleName.AUTHOR } });

  // 2. Upsert Admin User
  const user = await db.user.upsert({
    where: { email },
    update: {
      passwordHash,
      emailVerifiedAt: new Date(),
    },
    create: {
      email,
      name,
      passwordHash,
      emailVerifiedAt: new Date(),
    },
  });

  // 3. Grant ADMIN, EDITOR, and AUTHOR roles
  for (const r of [adminRole, editorRole, authorRole]) {
    await db.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: r.id } },
      update: {},
      create: { userId: user.id, roleId: r.id },
    });
  }

  // 4. Create Author Profile for authoring articles
  await db.authorProfile.upsert({
    where: { userId: user.id },
    update: {
      bio: "Chief Executive Editor & Newsroom Administrator at Ashivam Technologies.",
    },
    create: {
      userId: user.id,
      slug: slugify(name),
      bio: "Chief Executive Editor & Newsroom Administrator at Ashivam Technologies.",
    },
  });

  console.log("\n=======================================================");
  console.log(" SUCCESS: Admin Account Configured Securely");
  console.log(` Target Email: ${email}`);
  console.log(" Password:     [PROTECTED - Read from environment]");
  console.log(" Roles:        ADMIN, EDITOR, AUTHOR");
  console.log("=======================================================\n");
}

main()
  .catch((e) => {
    console.error("Failed to seed admin:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
