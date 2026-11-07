import { db, schema } from "@/db";
import { body, tenantRoute } from "@/lib/api";
import { newId } from "@/lib/ids";
import { listServices } from "@/lib/queries";
import { setServiceStaff } from "@/lib/catalog";
import { ServiceInput } from "@/lib/validators";

export const GET = tenantRoute("bookings.view", async (_req, t) => ({ services: await listServices(t.business.id) }));

export const POST = tenantRoute("catalog.manage", async (req, t) => {
  const { staffIds, ...input } = await body(req, ServiceInput);
  const [service] = await db.insert(schema.services).values({ id: newId("svc"), businessId: t.business.id, ...input }).returning();
  if (staffIds) await setServiceStaff(t.business.id, service.id, staffIds);
  return Response.json({ service }, { status: 201 });
});
