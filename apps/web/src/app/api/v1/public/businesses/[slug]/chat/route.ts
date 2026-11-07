import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { handleInbound } from "@/lib/agent/runtime";
import { body, publicRoute, query } from "@/lib/api";
import { recentMessages } from "@/lib/conversations";
import { rateLimit } from "@/lib/rate-limit";
import { businessForRequest } from "@/lib/public";

const view = (rows: schema.Message[]) => rows.filter((m) => m.role !== "system").map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.createdAt }));

/** Web chat on the booking page: same agent as WhatsApp/Telegram, thread keyed by a random browser session id. */
export const POST = publicRoute(async (req, p) => {
  rateLimit(req, "web-chat", 20, 60_000);
  const { sessionId, text } = await body(req, z.object({ sessionId: z.string().regex(/^[\w-]{16,64}$/), text: z.string().trim().min(1).max(2000) }));
  const business = await businessForRequest(req, p.slug);
  const r = await handleInbound({ business, channel: "web", threadId: `web:${sessionId}`, text, customer: null });
  return { messages: view(await recentMessages(r.conversationId, 50)) };
});

export const GET = publicRoute(async (req, p) => {
  const sessionId = query(req).get("sessionId") ?? "";
  if (!/^[\w-]{16,64}$/.test(sessionId)) return { messages: [] };
  const business = await businessForRequest(req, p.slug);
  const [conv] = await db
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.businessId, business.id), eq(schema.conversations.channel, "web"), eq(schema.conversations.externalThreadId, `web:${sessionId}`)));
  return { messages: conv ? view(await recentMessages(conv.id, 50)) : [] };
});
