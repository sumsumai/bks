import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { tenantRoute } from "@/lib/api";

export const POST = tenantRoute("bookings.view", async (_req, t) => {
  await db.update(schema.notifications).set({ readAt: new Date() }).where(and(eq(schema.notifications.businessId, t.business.id), isNull(schema.notifications.readAt)));
  return { ok: true };
});
