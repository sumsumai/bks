import { z } from "zod";
import { db, schema } from "@/db";
import { body, tenantRoute } from "@/lib/api";
import { assertStaffAllowed, setStaffHours } from "@/lib/catalog";
import { newId } from "@/lib/ids";
import { listStaff } from "@/lib/queries";
import { HoursInput } from "@/lib/validators";

const Create = z.object({ name: z.string().trim().min(1).max(80), title: z.string().max(80).default(""), bio: z.string().max(500).default(""), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6366f1"), hours: HoursInput.optional() });

export const GET = tenantRoute("bookings.view", async (_req, t) => ({ staff: await listStaff(t.business.id) }));

export const POST = tenantRoute("catalog.manage", async (req, t) => {
  const { hours, ...input } = await body(req, Create);
  await assertStaffAllowed(t.business);
  const [s] = await db.insert(schema.staff).values({ id: newId("stf"), businessId: t.business.id, ...input }).returning();
  if (hours) await setStaffHours(t.business.id, s.id, hours);
  return Response.json({ staff: s }, { status: 201 });
});
