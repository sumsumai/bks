import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/** Full-text search over one business's knowledge base. Scoped by business id; never global. */
export async function searchKnowledge(businessId: string, query: string, limit = 5) {
  const q = query.trim().slice(0, 200);
  if (!q) return [];
  const doc = sql`to_tsvector('simple', ${schema.knowledgeItems.title} || ' ' || ${schema.knowledgeItems.content})`;
  // OR the words together so partial matches still rank; plainto/websearch would require all terms.
  const words = q.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)?.slice(0, 12) ?? [];
  if (!words.length) return [];
  const tsq = sql`to_tsquery('simple', ${words.map((w) => `${w}:*`).join(" | ")})`;
  return db
    .select({
      id: schema.knowledgeItems.id,
      kind: schema.knowledgeItems.kind,
      title: schema.knowledgeItems.title,
      content: schema.knowledgeItems.content,
      rank: sql<number>`ts_rank(${doc}, ${tsq})`,
    })
    .from(schema.knowledgeItems)
    .where(and(eq(schema.knowledgeItems.businessId, businessId), sql`${doc} @@ ${tsq}`))
    .orderBy(desc(sql`ts_rank(${doc}, ${tsq})`))
    .limit(limit);
}

export async function listKnowledge(businessId: string) {
  return db
    .select()
    .from(schema.knowledgeItems)
    .where(eq(schema.knowledgeItems.businessId, businessId))
    .orderBy(schema.knowledgeItems.kind, schema.knowledgeItems.title);
}
