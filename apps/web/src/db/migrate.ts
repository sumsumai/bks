import { drizzle } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import path from "node:path";
import { Pool } from "pg";
import { databaseUrl, db, directDatabaseUrl } from "./index";

export async function runMigrations() {
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  if (databaseUrl()) {
    // Migrate over a direct connection (poolers can interfere with DDL transactions).
    const pool = new Pool({ connectionString: directDatabaseUrl(), max: 1 });
    try {
      await migratePg(drizzle(pool), { migrationsFolder });
    } finally {
      await pool.end();
    }
  } else await migratePglite(db as unknown as PgliteDatabase, { migrationsFolder });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => {
      console.log("Migrations applied.");
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
