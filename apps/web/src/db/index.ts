import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

// With DATABASE_URL (any Postgres 15+) we use node-postgres: always the case for the web app.
// Without it, an embedded in-process PGlite database: used by the test suite (memory://) and one-off scripts.
export const PGLITE_DIR = process.env.PGLITE_DIR ?? ".pglite";

function create(): DB {
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DB_POOL_MAX ?? 10) });
    return drizzlePg(pool, { schema });
  }
  // PGlite is single-process. The Next.js dev server runs several worker processes, which would open the
  // same data directory concurrently and corrupt it, so the web server always needs a real Postgres.
  if (process.env.NEXT_RUNTIME && PGLITE_DIR !== "memory://") {
    throw new Error("DATABASE_URL is required to run the web app. Start Postgres with `docker compose up -d` and set DATABASE_URL in apps/web/.env.local (see .env.example).");
  }
  const client = new PGlite(PGLITE_DIR, { extensions: { btree_gist } });
  // Same query-builder API; transaction and select types line up at runtime.
  return drizzlePglite(client, { schema }) as unknown as DB;
}

const g = globalThis as unknown as { __bksDb?: DB };
export const db: DB = g.__bksDb ?? (g.__bksDb = create());

export { schema };
