import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { body, tenantRoute } from "@/lib/api";
import { audit } from "@/lib/events";
import { AppError } from "@/lib/errors";
import { getSetting } from "@/lib/settings";
import { BusinessPatch } from "@/lib/validators";

export const GET = tenantRoute("bookings.view", async (_req, t) => ({ business: t.business, role: t.role }));

export const PATCH = tenantRoute("business.manage", async (req, t) => {
  const patch = await body(req, BusinessPatch);
  if (patch.published && !t.business.published && !(await getSetting("general.autoPublish"))) throw new AppError(403, "publish_requires_approval", "Publishing needs approval from the platform team");
  const [business] = await db.update(schema.businesses).set(patch).where(eq(schema.businesses.id, t.business.id)).returning();
  await audit(t.business.id, { type: "user", id: t.user.id }, "business.updated", t.business.id, { fields: Object.keys(patch) });
  return { business };
});
