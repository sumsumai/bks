import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { audit, notifyBusiness } from "../events";

export async function escalate(business: schema.Business, conv: schema.Conversation, reason: string) {
  await db
    .update(schema.conversations)
    .set({ status: "escalated", humanTakeover: true, escalationReason: reason.slice(0, 500) })
    .where(eq(schema.conversations.id, conv.id));
  conv.status = "escalated";
  conv.humanTakeover = true;
  await audit(business.id, { type: "agent" }, "conversation.escalated", conv.id, { reason });
  await notifyBusiness(business.id, {
    kind: "conversation.escalated",
    title: "A customer needs you",
    body: reason,
    href: `/app/inbox/${conv.id}`,
  });
}
