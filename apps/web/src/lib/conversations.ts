import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { newId } from "./ids";
import { telegramSend } from "./channels/telegram";
import { activeBusinessId, bindChat } from "./channels/telegram-router";
import { waSend } from "./channels/whatsapp";

type Channel = "whatsapp" | "telegram" | "web";

export async function getOrCreateConversation(
  businessId: string,
  channel: Channel,
  externalThreadId: string,
  customerId: string | null,
): Promise<schema.Conversation> {
  const [existing] = await db
    .select()
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.businessId, businessId),
        eq(schema.conversations.channel, channel),
        eq(schema.conversations.externalThreadId, externalThreadId),
      ),
    );
  if (existing) {
    if (!existing.customerId && customerId) {
      await db.update(schema.conversations).set({ customerId }).where(eq(schema.conversations.id, existing.id));
      existing.customerId = customerId;
    }
    return existing;
  }
  const [created] = await db
    .insert(schema.conversations)
    .values({ id: newId("cnv"), businessId, channel, externalThreadId, customerId })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  return getOrCreateConversation(businessId, channel, externalThreadId, customerId);
}

/** Append a message. Returns null when `externalId` was already stored (webhook retry). */
export async function appendMessage(
  conv: Pick<schema.Conversation, "id" | "businessId">,
  role: schema.Message["role"],
  content: string,
  opts: { externalId?: string; authorUserId?: string } = {},
): Promise<schema.Message | null> {
  const [msg] = await db
    .insert(schema.messages)
    .values({
      id: newId("msg"),
      businessId: conv.businessId,
      conversationId: conv.id,
      role,
      content,
      externalId: opts.externalId ?? null,
      authorUserId: opts.authorUserId ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (!msg) return null;
  await db
    .update(schema.conversations)
    .set(role === "owner" ? { lastMessageAt: new Date(), humanActiveAt: new Date() } : { lastMessageAt: new Date() })
    .where(eq(schema.conversations.id, conv.id));
  return msg;
}

export async function recentMessages(conversationId: string, limit = 30) {
  const rows = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(desc(schema.messages.createdAt))
    .limit(limit);
  return rows.reverse();
}

async function channelFor(businessId: string, kind: Channel) {
  const [ch] = await db
    .select()
    .from(schema.channels)
    .where(and(eq(schema.channels.businessId, businessId), eq(schema.channels.kind, kind)));
  return ch;
}

/**
 * Send text to the customer on the conversation's channel. Web chats are pulled by the widget.
 * Telegram goes through the shared platform bot: if the chat is currently bound to another business,
 * the message is prefixed with this business's name and the chat is re-bound so replies come back here.
 */
export async function deliver(conv: Pick<schema.Conversation, "businessId" | "channel" | "externalThreadId">, text: string) {
  if (conv.channel === "web") return;
  const ch = await channelFor(conv.businessId, conv.channel);
  if (!ch || ch.status !== "connected") {
    console.warn(`[deliver] ${conv.channel} not connected for ${conv.businessId}; message stored only`);
    return;
  }
  try {
    if (conv.channel === "telegram") {
      const active = await activeBusinessId(conv.externalThreadId);
      let body = text;
      if (active !== conv.businessId) {
        const [b] = await db.select({ name: schema.businesses.name }).from(schema.businesses).where(eq(schema.businesses.id, conv.businessId));
        body = `${b?.name ?? "Business"}: ${text}`;
        await bindChat(conv.externalThreadId, conv.businessId);
      }
      await telegramSend(conv.externalThreadId, body);
    } else {
      await waSend(conv.businessId, conv.externalThreadId, text);
    }
    await db.insert(schema.usageEvents).values({ id: newId("use"), businessId: conv.businessId, kind: "message_out" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.update(schema.channels).set({ lastError: msg.slice(0, 500) }).where(eq(schema.channels.id, ch.id));
    console.error("[deliver]", msg);
  }
}

/**
 * Message a customer proactively (confirmations, reminders, approval outcomes) on the channel
 * they last used with this business. Returns false if the customer has no messaging conversation.
 */
export async function messageCustomer(businessId: string, customerId: string, text: string, opts: { channels?: ("whatsapp" | "telegram" | "web")[] } = {}): Promise<boolean> {
  const [conv] = await db
    .select()
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.businessId, businessId),
        eq(schema.conversations.customerId, customerId),
        inArray(schema.conversations.channel, opts.channels ?? ["whatsapp", "telegram", "web"]),
      ),
    )
    .orderBy(sql`case when ${schema.conversations.channel} = 'web' then 1 else 0 end`, desc(schema.conversations.lastMessageAt))
    .limit(1);
  if (!conv) return false;
  await appendMessage(conv, "agent", text);
  await deliver(conv, text);
  return conv.channel !== "web";
}
