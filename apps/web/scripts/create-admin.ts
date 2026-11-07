/**
 * Create (or promote) the first platform administrator.
 *   npm run admin:create -- admin@yourdomain.com "Your Name"
 * Prints a generated password unless ADMIN_PASSWORD is set. Safe to re-run: an existing user is promoted.
 */
import { sql } from "drizzle-orm";
import { db, schema } from "../src/db";
import { runMigrations } from "../src/db/migrate";
import { hashPassword, randomToken } from "../src/lib/crypto";
import { newId } from "../src/lib/ids";

async function main() {
  const [email, ...nameParts] = process.argv.slice(2);
  if (!email || !email.includes("@")) {
    console.error('Usage: npm run admin:create -- admin@example.com "Full Name"');
    process.exit(1);
  }
  await runMigrations();
  const name = nameParts.join(" ") || "Administrator";
  const password = process.env.ADMIN_PASSWORD || randomToken(12);
  const [existing] = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${email.toLowerCase()}`);
  if (existing) {
    await db.update(schema.users).set({ platformRole: "admin", disabled: false }).where(sql`${schema.users.id} = ${existing.id}`);
    console.log(`${email} is now a platform administrator (password unchanged).`);
  } else {
    await db.insert(schema.users).values({ id: newId("usr"), email: email.toLowerCase(), name, passwordHash: await hashPassword(password), platformRole: "admin" });
    console.log(`Created administrator ${email}\nPassword: ${password}\nSign in at /login and change it from Admin → Users.`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
