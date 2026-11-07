import { BufferJSON, initAuthCreds, proto, type AuthenticationCreds, type AuthenticationState, type SignalDataTypeMap } from "baileys";
import { decrypt, encrypt } from "./crypto.js";
import { pool } from "./db.js";

/**
 * Baileys auth state persisted in Postgres (table wa_auth), one row per key, encrypted at rest.
 * This replaces useMultiFileAuthState so sessions survive restarts and redeploys.
 */
export async function usePostgresAuthState(businessId: string): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void>; clear: () => Promise<void> }> {
  const read = async (key: string) => {
    const r = await pool.query<{ value: string }>("select value from wa_auth where business_id = $1 and key = $2", [businessId, key]);
    return r.rows[0] ? JSON.parse(decrypt(r.rows[0].value), BufferJSON.reviver) : null;
  };
  const write = (key: string, value: unknown) =>
    pool.query(
      `insert into wa_auth (business_id, key, value, updated_at) values ($1, $2, $3, now())
       on conflict (business_id, key) do update set value = excluded.value, updated_at = now()`,
      [businessId, key, encrypt(JSON.stringify(value, BufferJSON.replacer))],
    );
  const remove = (key: string) => pool.query("delete from wa_auth where business_id = $1 and key = $2", [businessId, key]);

  const creds: AuthenticationCreds = (await read("creds")) ?? initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const out: { [id: string]: SignalDataTypeMap[T] } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await read(`${type}:${id}`);
              if (type === "app-state-sync-key" && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
              out[id] = value;
            }),
          );
          return out;
        },
        set: async (data) => {
          const tasks: Promise<unknown>[] = [];
          for (const category in data) {
            const entries = data[category as keyof typeof data] ?? {};
            for (const id in entries) {
              const value = entries[id];
              tasks.push(value ? write(`${category}:${id}`, value) : remove(`${category}:${id}`));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => {
      await write("creds", creds);
    },
    clear: async () => {
      await pool.query("delete from wa_auth where business_id = $1", [businessId]);
    },
  };
}
