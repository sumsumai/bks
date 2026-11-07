import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, tenantRoute } from "@/lib/api";
import { setStaffHours } from "@/lib/catalog";
import { notFound } from "@/lib/errors";
import { HoursInput } from "@/lib/validators";

async function own(businessId: string, staffId: string) {
  const [s] = await db.select().from(schema.staff).where(and(eq(schema.staff.id, staffId), eq(schema.staff.businessId, businessId)));
  if (!s) throw notFound("Staff member");
  return s;
}

export const GET = tenantRoute("bookings.view", async (_req, t, p) => {
  await own(t.business.id, p.id);
  const hours = await db.select().from(schema.availabilityRules).where(and(eq(schema.availabilityRules.businessId, t.business.id), eq(schema.availabilityRules.staffId, p.id)));
  return { hours: hours.map(({ weekday, startMinute, endMinute }) => ({ weekday, startMinute, endMinute })) };
});

export const PUT = tenantRoute("catalog.manage", async (req, t, p) => {
  await own(t.business.id, p.id);
  const { hours } = await body(req, z.object({ hours: HoursInput }));
  await setStaffHours(t.business.id, p.id, hours);
  return { hours };
});
