import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { handleInbound } from "../agent/runtime";
import { findOrCreateCustomer } from "../bookings";
import { appendMessage, getOrCreateConversation } from "../conversations";
import { telegramAnswerCallback, telegramSend, telegramTyping, type TelegramUpdate } from "./telegram";

/**
 * Routing for the shared platform bot.
 *
 * One Telegram chat can talk to several businesses over time, so each chat has an *active* business:
 * - `t.me/<bot>?start=<slug>` (the link on each booking page) binds the chat to that business;
 * - `/switch` lists the businesses this person has talked to, as buttons;
 * - a proactive message from a business (reminder, approval outcome) re-binds the chat to it and is
 *   prefixed with the business name, so replies go to the right place (see conversations.deliver).
 * Everything after routing is per-business: separate customer records, conversations and agents.
 */

async function businessWithTelegram(where: ReturnType<typeof eq>) {
  const [row] = await db
    .select({ business: schema.businesses })
    .from(schema.businesses)
    .innerJoin(schema.channels, and(eq(schema.channels.businessId, schema.businesses.id), eq(schema.channels.kind, "telegram"), eq(schema.channels.status, "connected")))
    .where(and(where, eq(schema.businesses.suspended, false)));
  return row?.business ?? null;
}

export async function bindChat(chatId: string, businessId: string) {
  await db
    .insert(schema.telegramChats)
    .values({ chatId, activeBusinessId: businessId })
    .onConflictDoUpdate({ target: schema.telegramChats.chatId, set: { activeBusinessId: businessId, updatedAt: new Date() } });
}

export async function activeBusinessId(chatId: string) {
  const [row] = await db.select().from(schema.telegramChats).where(eq(schema.telegramChats.chatId, chatId));
  return row?.activeBusinessId ?? null;
}

/** Businesses this chat has talked to (have a customer record for this chat id), most recent first. */
async function recentBusinesses(chatId: string) {
  return db
    .select({ id: schema.businesses.id, name: schema.businesses.name, last: sql<Date>`max(${schema.conversations.lastMessageAt})` })
    .from(schema.customers)
    .innerJoin(schema.businesses, eq(schema.businesses.id, schema.customers.businessId))
    .innerJoin(schema.channels, and(eq(schema.channels.businessId, schema.businesses.id), eq(schema.channels.kind, "telegram"), eq(schema.channels.status, "connected")))
    .leftJoin(schema.conversations, and(eq(schema.conversations.customerId, schema.customers.id), eq(schema.conversations.channel, "telegram")))
    .where(and(eq(schema.customers.telegramChatId, chatId), eq(schema.businesses.suspended, false)))
    .groupBy(schema.businesses.id, schema.businesses.name)
    .orderBy(desc(sql`max(${schema.conversations.lastMessageAt})`))
    .limit(8);
}

async function sendPicker(chatId: string, intro: string) {
  const recent = await recentBusinesses(chatId);
  if (!recent.length) {
    await telegramSend(chatId, `${intro}\n\nOpen the Telegram link on a business's booking page to start chatting with them.`);
    return;
  }
  await telegramSend(chatId, `${intro}\n\nWho would you like to talk to?`, recent.map((b) => [{ text: b.name, callback_data: `biz:${b.id}` }]));
}

/** Greet on (re)binding: stored in the business's conversation so the owner sees it too. */
async function welcome(business: schema.Business, chatId: string, name: string) {
  const customer = await findOrCreateCustomer(business.id, { name, telegramChatId: chatId });
  const conv = await getOrCreateConversation(business.id, "telegram", chatId, customer.id);
  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.businessId, business.id));
  const greeting = agent?.persona.greeting?.trim() || `Hi ${name.split(" ")[0]}! You're chatting with ${business.name}.`;
  const text = `${greeting}\nI can answer questions, check availability and book for you. (Type /switch to talk to another business.)`;
  await appendMessage(conv, "agent", text);
  await telegramSend(chatId, text);
}

export async function handleTelegramUpdate(u: TelegramUpdate) {
  if (u.kind === "callback") {
    const id = u.data.startsWith("biz:") ? u.data.slice(4) : null;
    const business = id ? await businessWithTelegram(eq(schema.businesses.id, id)) : null;
    await telegramAnswerCallback(u.callbackId, business ? business.name : "No longer available");
    if (!business) return;
    await bindChat(u.chatId, business.id);
    await welcome(business, u.chatId, u.name);
    return;
  }

  if (u.command === "start") {
    const business = u.startPayload ? await businessWithTelegram(eq(schema.businesses.slug, u.startPayload)) : null;
    if (business) {
      await bindChat(u.chatId, business.id);
      await welcome(business, u.chatId, u.name);
      return;
    }
    await sendPicker(u.chatId, u.startPayload ? "That business isn't available on Telegram right now." : "Welcome! This assistant books appointments with local businesses.");
    return;
  }
  if (u.command === "switch" || u.command === "businesses") {
    await sendPicker(u.chatId, "Sure.");
    return;
  }

  let businessId = await activeBusinessId(u.chatId);
  if (!businessId) {
    const recent = await recentBusinesses(u.chatId);
    if (recent.length === 1) {
      businessId = recent[0].id;
      await bindChat(u.chatId, businessId);
    } else {
      await sendPicker(u.chatId, "Hi!");
      return;
    }
  }
  const business = await businessWithTelegram(eq(schema.businesses.id, businessId));
  if (!business) {
    await sendPicker(u.chatId, "That business isn't available on Telegram right now.");
    return;
  }
  void telegramTyping(u.chatId);
  const customer = await findOrCreateCustomer(business.id, { name: u.name, telegramChatId: u.chatId });
  await handleInbound({ business, channel: "telegram", threadId: u.chatId, text: u.text, externalMessageId: u.messageId, customer });
}
