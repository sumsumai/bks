/**
 * Runs on Vercel before `next build` (see vercel.json):
 *   1. checks a database is connected (Neon from the Marketplace),
 *   2. applies migrations,
 *   3. creates the first platform administrator from ADMIN_EMAIL / ADMIN_PASSWORD if none exists,
 *   4. optionally loads demo data (DEMO_DATA=true) into an empty database.
 * Safe on every deploy: each step is idempotent.
 */
import { sql } from "drizzle-orm";
import { databaseUrl, db, schema } from "../src/db";
import { runMigrations } from "../src/db/migrate";
import { hashPassword } from "../src/lib/crypto";
import { newId } from "../src/lib/ids";

function fail(msg: string): never {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

async function main() {
  if (!databaseUrl()) {
    fail(
      "No database connected. In your Vercel project open Storage → Create Database → Neon (Postgres), connect it to this project, then Redeploy.",
    );
  }
  if (process.env.VERCEL_ENV === "production" && (process.env.APP_ENCRYPTION_KEY ?? "").length < 16) {
    fail("APP_ENCRYPTION_KEY must be set (at least 16 random characters) in Project Settings → Environment Variables.");
  }

  await runMigrations();
  console.log("✓ Database migrations applied");

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const [{ n }] = (await db.execute(sql`select count(*)::int as n from users where platform_role = 'admin'`)).rows as { n: number }[];
  let admin: schema.User | undefined;
  if (Number(n) === 0) {
    const password = process.env.ADMIN_PASSWORD ?? "";
    if (!email || !email.includes("@") || password.length < 8) {
      console.warn("! No administrator yet: set ADMIN_EMAIL and ADMIN_PASSWORD (8+ characters) and redeploy to create one.");
    } else {
      const [existing] = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`);
      if (existing) {
        [admin] = await db.update(schema.users).set({ platformRole: "admin", disabled: false }).where(sql`${schema.users.id} = ${existing.id}`).returning();
      } else {
        [admin] = await db
          .insert(schema.users)
          .values({ id: newId("usr"), email, name: process.env.ADMIN_NAME || "Administrator", passwordHash: await hashPassword(password), platformRole: "admin" })
          .returning();
      }
      console.log(`✓ Administrator ready: ${email} (change the password after first sign-in)`);
    }
  }

  if (process.env.DEMO_DATA === "true") {
    if (!admin && email) [admin] = await db.select().from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`);
    const { seedDemo } = await import("../src/db/seed");
    if (await seedDemo({ admin })) console.log("✓ Demo businesses loaded (demo owners use the password demo-password)");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
