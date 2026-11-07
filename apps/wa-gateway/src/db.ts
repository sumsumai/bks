import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

/** Businesses whose WhatsApp should be live (connected, or mid-pairing when the gateway restarted). */
export async function businessesToRestore(): Promise<string[]> {
  const r = await pool.query<{ business_id: string }>(
    `select c.business_id from channels c join businesses b on b.id = c.business_id
     where c.kind = 'whatsapp' and c.status = 'connected' and c.mode = 'linked_device' and b.suspended = false`,
  );
  return r.rows.map((x) => x.business_id);
}
