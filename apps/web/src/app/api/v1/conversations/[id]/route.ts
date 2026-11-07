import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { body, tenantRoute } from "@/lib/api";
import { appendMessage } from "@/lib/conversations";
import { notFound } from "@/lib/errors";
import { audit } from "@/lib/events";
import { getConversation } from "@/lib/queries";

export const GET = tenantRoute("inbox.reply", async (_req, t, p) => ({ conversation: await getConversation(t.business.id, p.id) }));

/** takeover: a human answers, the agent stays silent. release: hand back to the agent. close: archive. */
export const PATCH = tenantRoute("inbox.reply", async (req, t, p) => {
  const { action } = await body(req, z.object({ action: z.enum(["takeover", "release", "close", "reopen"]) }));
  const set =
    action === "takeover"
      ? { humanTakeover: true }
      : action === "release"
        ? { humanTakeover: false, status: "open" as const, escalationReason: null }
        : action === "close"
          ? { status: "closed" as const, humanTakeover: false }
          : { status: "open" as const };
  const [conv] = await db.update(schema.conversations).set(set).where(and(eq(schema.conversations.id, p.id), eq(schema.conversations.businessId, t.business.id))).returning();
  if (!conv) throw notFound("Conversation");
  if (action === "release") await appendMessage(conv, "system", "Conversation handed back to the assistant");
  if (action === "takeover") await appendMessage(conv, "system", `${t.user.name} joined the conversation`);
  await audit(t.business.id, { type: "user", id: t.user.id }, `conversation.${action}`, conv.id);
  return { conversation: conv };
});
