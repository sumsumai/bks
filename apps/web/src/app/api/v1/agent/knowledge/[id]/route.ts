import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { body, tenantRoute } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { KnowledgeInput } from "@/lib/validators";

export const PATCH = tenantRoute("agent.manage", async (req, t, p) => {
  const patch = await body(req, KnowledgeInput.partial());
  const [item] = await db
    .update(schema.knowledgeItems)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(schema.knowledgeItems.id, p.id), eq(schema.knowledgeItems.businessId, t.business.id)))
    .returning();
  if (!item) throw notFound("Knowledge item");
  return { item };
});

export const DELETE = tenantRoute("agent.manage", async (_req, t, p) => {
  await db.delete(schema.knowledgeItems).where(and(eq(schema.knowledgeItems.id, p.id), eq(schema.knowledgeItems.businessId, t.business.id)));
  return { ok: true };
});
