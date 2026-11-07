import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { notFound } from "./errors";
import { audit } from "./events";

/** Everything a business holds about one customer (GDPR Art. 15 / 20 export). */
export async function exportCustomer(businessId: string, customerId: string) {
  const [customer] = await db.select().from(schema.customers).where(and(eq(schema.customers.id, customerId), eq(schema.customers.businessId, businessId)));
  if (!customer) throw notFound("Customer");
  const [bookings, conversations, memories] = await Promise.all([
    db.select().from(schema.bookings).where(and(eq(schema.bookings.businessId, businessId), eq(schema.bookings.customerId, customerId))),
    db.select().from(schema.conversations).where(and(eq(schema.conversations.businessId, businessId), eq(schema.conversations.customerId, customerId))),
    db.select().from(schema.customerMemories).where(and(eq(schema.customerMemories.businessId, businessId), eq(schema.customerMemories.customerId, customerId))),
  ]);
  const messages = [];
  for (const c of conversations) messages.push(...(await db.select().from(schema.messages).where(eq(schema.messages.conversationId, c.id))));
  return { exportedAt: new Date().toISOString(), customer, bookings, conversations, messages, agentMemories: memories };
}

/**
 * Right to erasure (Art. 17). Personal data is removed; booking rows stay (anonymised) because the
 * business needs them for accounting, and they no longer identify anyone.
 */
export async function eraseCustomer(businessId: string, customerId: string, actorUserId: string) {
  const [customer] = await db.select().from(schema.customers).where(and(eq(schema.customers.id, customerId), eq(schema.customers.businessId, businessId)));
  if (!customer) throw notFound("Customer");
  const convs = await db.select({ id: schema.conversations.id }).from(schema.conversations).where(and(eq(schema.conversations.businessId, businessId), eq(schema.conversations.customerId, customerId)));
  for (const c of convs) await db.delete(schema.conversations).where(eq(schema.conversations.id, c.id)); // cascades messages
  await db.delete(schema.customerMemories).where(and(eq(schema.customerMemories.businessId, businessId), eq(schema.customerMemories.customerId, customerId)));
  await db.update(schema.bookings).set({ notes: "" }).where(and(eq(schema.bookings.businessId, businessId), eq(schema.bookings.customerId, customerId)));
  await db
    .update(schema.customers)
    .set({ name: "Erased customer", email: null, phone: null, telegramChatId: null, whatsappId: null, notes: "", marketingConsent: false, erasedAt: new Date() })
    .where(eq(schema.customers.id, customerId));
  await audit(businessId, { type: "user", id: actorUserId }, "customer.erased", customerId);
}
