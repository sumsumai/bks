import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { AppError } from "./errors";
import { newId } from "./ids";
import { activeStaffCount, entitlementsOf } from "./plans";

export async function setServiceStaff(businessId: string, serviceId: string, staffIds: string[]) {
  const valid = staffIds.length
    ? await db.select({ id: schema.staff.id }).from(schema.staff).where(and(eq(schema.staff.businessId, businessId), inArray(schema.staff.id, staffIds)))
    : [];
  await db.delete(schema.serviceStaff).where(eq(schema.serviceStaff.serviceId, serviceId));
  if (valid.length) await db.insert(schema.serviceStaff).values(valid.map((s) => ({ serviceId, staffId: s.id })));
}

export async function setStaffHours(businessId: string, staffId: string, hours: { weekday: number; startMinute: number; endMinute: number }[]) {
  await db.delete(schema.availabilityRules).where(and(eq(schema.availabilityRules.businessId, businessId), eq(schema.availabilityRules.staffId, staffId)));
  if (hours.length) await db.insert(schema.availabilityRules).values(hours.map((h) => ({ id: newId("avl"), businessId, staffId, ...h })));
}

/** Plan limit on active team members. */
export async function assertStaffAllowed(business: schema.Business) {
  const { maxStaff } = await entitlementsOf(business);
  if (maxStaff !== null && (await activeStaffCount(business.id)) >= maxStaff)
    throw new AppError(409, "plan_limit", `Your plan includes up to ${maxStaff} team members. Upgrade in Plan & billing to add more.`);
}
