import { db, schema } from "@/db";
import { body, tenantRoute } from "@/lib/api";
import { audit } from "@/lib/events";
import { newId } from "@/lib/ids";
import { listKnowledge } from "@/lib/knowledge";
import { KnowledgeInput } from "@/lib/validators";

export const GET = tenantRoute("inbox.reply", async (_req, t) => ({ items: await listKnowledge(t.business.id) }));

export const POST = tenantRoute("agent.manage", async (req, t) => {
  const input = await body(req, KnowledgeInput);
  const [item] = await db.insert(schema.knowledgeItems).values({ id: newId("kno"), businessId: t.business.id, ...input }).returning();
  await audit(t.business.id, { type: "user", id: t.user.id }, "knowledge.created", item.id);
  return Response.json({ item }, { status: 201 });
});
