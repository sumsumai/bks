import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, tenantRoute } from "@/lib/api";
import { appendMessage, deliver } from "@/lib/conversations";
import { notFound } from "@/lib/errors";

/** Owner/staff reply. Replying takes the conversation over so the agent doesn't talk over the human. */
export const POST = tenantRoute("inbox.reply", async (req, t, p) => {
  const { text } = await body(req, z.object({ text: z.string().trim().min(1).max(4000) }));
  const [conv] = await db.select().from(schema.conversations).where(and(eq(schema.conversations.id, p.id), eq(schema.conversations.businessId, t.business.id)));
  if (!conv) throw notFound("Conversation");
  if (!conv.humanTakeover) await db.update(schema.conversations).set({ humanTakeover: true }).where(eq(schema.conversations.id, conv.id));
  const message = await appendMessage(conv, "owner", text, { authorUserId: t.user.id });
  await deliver(conv, text);
  return Response.json({ message }, { status: 201 });
});
