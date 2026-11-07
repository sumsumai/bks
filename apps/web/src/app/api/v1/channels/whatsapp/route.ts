import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, tenantRoute } from "@/lib/api";
import { disconnectChannel, publicChannel, startWhatsAppLink } from "@/lib/channels";

async function current(businessId: string) {
  const [c] = await db.select().from(schema.channels).where(and(eq(schema.channels.businessId, businessId), eq(schema.channels.kind, "whatsapp")));
  return publicChannel(c);
}

/** Poll this while linking: status "pairing" carries the current QR payload or pairing code. */
export const GET = tenantRoute("agent.manage", async (_req, t) => ({ channel: await current(t.business.id) }));

/** Start linking. With { phone }, the gateway returns a pairing code to type on that phone instead of a QR. */
export const POST = tenantRoute("agent.manage", async (req, t) => {
  const { phone } = await body(req, z.object({ phone: z.string().max(30).optional() }));
  await startWhatsAppLink(t.business, t.user.id, phone || undefined);
  return { channel: await current(t.business.id) };
});

/** Unlink our device. The business keeps using WhatsApp normally. */
export const DELETE = tenantRoute("agent.manage", async (_req, t) => {
  await disconnectChannel(t.business, "whatsapp", t.user.id);
  return { channel: await current(t.business.id) };
});
