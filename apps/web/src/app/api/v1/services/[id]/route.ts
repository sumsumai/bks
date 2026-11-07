import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { body, tenantRoute } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { setServiceStaff } from "@/lib/catalog";
import { ServiceInput } from "@/lib/validators";

export const PATCH = tenantRoute("catalog.manage", async (req, t, p) => {
  const { staffIds, ...patch } = await body(req, ServiceInput.partial());
  const [service] = await db
    .update(schema.services)
    .set(patch)
    .where(and(eq(schema.services.id, p.id), eq(schema.services.businessId, t.business.id)))
    .returning();
  if (!service) throw notFound("Service");
  if (staffIds) await setServiceStaff(t.business.id, service.id, staffIds);
  return { service };
});

export const DELETE = tenantRoute("catalog.manage", async (_req, t, p) => {
  // Services with booking history are archived rather than deleted.
  const [service] = await db
    .update(schema.services)
    .set({ active: false })
    .where(and(eq(schema.services.id, p.id), eq(schema.services.businessId, t.business.id)))
    .returning();
  if (!service) throw notFound("Service");
  return { ok: true };
});
