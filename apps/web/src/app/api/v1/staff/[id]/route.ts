import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, tenantRoute } from "@/lib/api";
import { notFound } from "@/lib/errors";

const Patch = z.object({ name: z.string().trim().min(1).max(80), title: z.string().max(80), bio: z.string().max(500), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), active: z.boolean() }).partial();

export const PATCH = tenantRoute("catalog.manage", async (req, t, p) => {
  const patch = await body(req, Patch);
  const [s] = await db.update(schema.staff).set(patch).where(and(eq(schema.staff.id, p.id), eq(schema.staff.businessId, t.business.id))).returning();
  if (!s) throw notFound("Staff member");
  return { staff: s };
});
