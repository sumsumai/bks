import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, tenantRoute } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { listBookings } from "@/lib/queries";

export const GET = tenantRoute("bookings.view", async (_req, t, p) => {
  const [customer] = await db.select().from(schema.customers).where(and(eq(schema.customers.id, p.id), eq(schema.customers.businessId, t.business.id)));
  if (!customer) throw notFound("Customer");
  const memories = await db.select().from(schema.customerMemories).where(and(eq(schema.customerMemories.businessId, t.business.id), eq(schema.customerMemories.customerId, p.id)));
  return { customer, memories, bookings: await listBookings(t.business.id, { customerId: p.id }) };
});

export const PATCH = tenantRoute("customers.manage", async (req, t, p) => {
  const patch = await body(req, z.object({ name: z.string().min(1).max(80), email: z.string().max(200).nullable(), phone: z.string().max(40).nullable(), notes: z.string().max(4000) }).partial());
  const [customer] = await db.update(schema.customers).set(patch).where(and(eq(schema.customers.id, p.id), eq(schema.customers.businessId, t.business.id))).returning();
  if (!customer) throw notFound("Customer");
  return { customer };
});
