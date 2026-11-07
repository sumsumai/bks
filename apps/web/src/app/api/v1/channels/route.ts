import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { tenantRoute } from "@/lib/api";
import { publicChannel } from "@/lib/channels";
import { telegramAvailable } from "@/lib/channels/telegram";
import { whatsappAvailable } from "@/lib/channels/whatsapp";
import { entitlementsOf } from "@/lib/plans";

export const GET = tenantRoute("inbox.reply", async (_req, t) => {
  const ent = await entitlementsOf(t.business);
  const rows = await db.select().from(schema.channels).where(eq(schema.channels.businessId, t.business.id));
  return {
    channels: rows.map(publicChannel),
    available: { whatsapp: ent.whatsapp && (await whatsappAvailable()), telegram: ent.telegram && (await telegramAvailable()) },
  };
});
