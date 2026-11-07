import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/**
 * Connection string for the app. DATABASE_URL everywhere; POSTGRES_URL is accepted too because some
 * Vercel Marketplace databases (Neon, Supabase) inject that name. On Neon both are the pooled endpoint.
 */
export const databaseUrl = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

/** Direct (non-pooled) connection for migrations, when the provider gives one. */
export const directDatabaseUrl = () => process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || databaseUrl();

// Without a URL, an embedded in-process PGlite database: used by the test suite (memory://) and scripts.
export const PGLITE_DIR = process.env.PGLITE_DIR ?? ".pglite";

function create(): DB {
  const url = databaseUrl();
  if (url) {
    const pool = new Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? (process.env.VERCEL ? 5 : 10)), idleTimeoutMillis: 10_000 });
    // On Vercel (Fluid compute), close idle connections before an instance is suspended.
    if (process.env.VERCEL) attachDatabasePool(pool);
    return drizzlePg(pool, { schema });
  }
  // PGlite is single-process. The Next.js dev server runs several worker processes, which would open the
  // same data directory concurrently and corrupt it, so the web server always needs a real Postgres.
  if (process.env.NEXT_RUNTIME && PGLITE_DIR !== "memory://") {
    throw new Error("DATABASE_URL is required to run the web app. Locally: `docker compose up -d` and set DATABASE_URL in apps/web/.env.local. On Vercel: add a Neon database from the project's Storage tab, then redeploy.");
  }
  const client = new PGlite(PGLITE_DIR, { extensions: { btree_gist } });
  return drizzlePglite(client, { schema }) as unknown as DB;
}

const g = globalThis as unknown as { __bksDb?: DB };
export const db: DB = g.__bksDb ?? (g.__bksDb = create());

export { schema };
