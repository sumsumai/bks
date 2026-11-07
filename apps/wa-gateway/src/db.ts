import pg from "pg";

// Same database as the web app. Prefer a direct (non-pooled) connection when the provider offers one.
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) throw new Error("DATABASE_URL is required");
export const pool = new pg.Pool({ connectionString: url, max: 10 });

/** Businesses whose WhatsApp should be live (connected, or mid-pairing when the gateway restarted). */
export async function businessesToRestore(): Promise<string[]> {
  const r = await pool.query<{ business_id: string }>(
    `select c.business_id from channels c join businesses b on b.id = c.business_id
     where c.kind = 'whatsapp' and c.status = 'connected' and c.mode = 'linked_device' and b.suspended = false`,
  );
  return r.rows.map((x) => x.business_id);
}
