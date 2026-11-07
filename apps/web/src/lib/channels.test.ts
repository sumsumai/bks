import assert from "node:assert/strict";
import { before, beforeEach, describe, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { runMigrations } from "../db/migrate";
import { createBusiness } from "./businesses";
import { enableTelegram } from "./channels";
import { parseTelegramUpdate } from "./channels/telegram";
import { activeBusinessId, handleTelegramUpdate } from "./channels/telegram-router";
import { handleGatewayEvent } from "./channels/whatsapp-router";
import { messageCustomer } from "./conversations";
import { handleInbound } from "./agent/runtime";
import { newId } from "./ids";

process.env.AGENT_OFFLINE = "1";
process.env.TELEGRAM_BOT_TOKEN = "123:test";
process.env.TELEGRAM_BOT_USERNAME = "bks_test_bot";
process.env.WA_GATEWAY_URL = "http://gateway.test";
process.env.WA_GATEWAY_SECRET = "s3cret";

// Capture outbound Telegram / WhatsApp calls instead of hitting the network.
const sent: { url: string; body: any }[] = [];
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  sent.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
  return new Response(JSON.stringify({ ok: true, result: { message_id: 1 }, messages: [{ id: "wamid.x" }] }), { status: 200 });
}) as typeof fetch;
const telegramTexts = () => sent.filter((s) => s.url.includes("/sendMessage")).map((s) => s.body);
const gatewaySends = () => sent.filter((s) => s.url.startsWith("http://gateway.test") && s.url.endsWith("/send")).map((s) => s.body);

async function biz(name: string) {
  const [owner] = await db.insert(schema.users).values({ id: newId("usr"), email: `${newId("usr")}@t.example`, name, passwordHash: "x" }).returning();
  const b = await createBusiness(owner, { name, category: "hair", city: "Paris", timezone: "Europe/Paris", currency: "EUR" });
  const [business] = await db.update(schema.businesses).set({ published: true }).where(eq(schema.businesses.id, b.id)).returning();
  return { business, owner };
}

const tgMessage = (chatId: number, text: string, id = Math.floor(Math.random() * 1e9)) =>
  parseTelegramUpdate({ message: { message_id: id, text, chat: { id: chatId, type: "private" }, from: { first_name: "Léa" } } })!;

before(runMigrations);
beforeEach(() => void (sent.length = 0));

describe("shared Telegram bot", () => {
  test("deep link binds the chat; messages reach that business's agent; /switch offers known businesses", async () => {
    const a = await biz("Salon Alpha");
    const b = await biz("Spa Beta");
    const chA = await enableTelegram(a.business, a.owner.id);
    await enableTelegram(b.business, b.owner.id);
    assert.equal(chA.publicHandle, `https://t.me/bks_test_bot?start=${a.business.slug}`);

    const chat = 4242;
    await handleTelegramUpdate(tgMessage(chat, `/start ${a.business.slug}`));
    assert.equal(await activeBusinessId(String(chat)), a.business.id);
    assert.match(telegramTexts().at(-1).text, /Salon Alpha/);

    await handleTelegramUpdate(tgMessage(chat, "how much is it?"));
    const convA = await db.select().from(schema.conversations).where(and(eq(schema.conversations.businessId, a.business.id), eq(schema.conversations.externalThreadId, String(chat))));
    assert.equal(convA.length, 1);
    assert.equal((await db.select().from(schema.conversations).where(eq(schema.conversations.businessId, b.business.id))).length, 0);

    await handleTelegramUpdate(tgMessage(chat, `/start ${b.business.slug}`));
    sent.length = 0;
    await handleTelegramUpdate(tgMessage(chat, "/switch"));
    const picker = telegramTexts().at(-1);
    const names = picker.reply_markup.inline_keyboard.map((row: any[]) => row[0].text).sort();
    assert.deepEqual(names, ["Salon Alpha", "Spa Beta"]);

    // Picking a button re-binds.
    await handleTelegramUpdate(parseTelegramUpdate({ callback_query: { id: "cb1", data: `biz:${a.business.id}`, from: { first_name: "Léa" }, message: { chat: { id: chat, type: "private" } } } })!);
    assert.equal(await activeBusinessId(String(chat)), a.business.id);
  });

  test("a proactive message from another business is prefixed and re-binds the chat", async () => {
    const a = await biz("Barber Gamma");
    const b = await biz("Nails Delta");
    await enableTelegram(a.business, a.owner.id);
    await enableTelegram(b.business, b.owner.id);
    const chat = 777;
    await handleTelegramUpdate(tgMessage(chat, `/start ${b.business.slug}`));
    await handleTelegramUpdate(tgMessage(chat, `/start ${a.business.slug}`));
    const [custB] = await db.select().from(schema.customers).where(and(eq(schema.customers.businessId, b.business.id), eq(schema.customers.telegramChatId, String(chat))));
    sent.length = 0;
    await messageCustomer(b.business.id, custB.id, "Reminder: tomorrow 10:00");
    assert.equal(telegramTexts().at(-1).text, "Nails Delta: Reminder: tomorrow 10:00");
    assert.equal(await activeBusinessId(String(chat)), b.business.id);
  });

  test("unknown chats get a picker instead of reaching any business", async () => {
    await handleTelegramUpdate(tgMessage(999001, "hello?"));
    assert.match(telegramTexts().at(-1).text, /Open the Telegram link/);
    assert.equal(await activeBusinessId("999001"), null);
  });
});

describe("WhatsApp via the business's own linked device", () => {
  async function linked() {
    const x = await biz("Studio Echo");
    await handleGatewayEvent(x.business.id, { type: "qr", qr: "2@abc" });
    let [ch] = await db.select().from(schema.channels).where(and(eq(schema.channels.businessId, x.business.id), eq(schema.channels.kind, "whatsapp")));
    assert.equal(ch.status, "pairing");
    assert.equal(ch.pairing?.qr, "2@abc");
    await handleGatewayEvent(x.business.id, { type: "connected", phone: "33699999999", name: "Studio Echo" });
    [ch] = await db.select().from(schema.channels).where(eq(schema.channels.id, ch.id));
    assert.equal(ch.status, "connected");
    assert.equal(ch.pairing, null);
    assert.equal(ch.publicHandle, "33699999999");
    return x;
  }

  test("customer messages reach the agent and replies go out through the gateway", async () => {
    const x = await linked();
    await handleGatewayEvent(x.business.id, { type: "message", thread: "33600000001", id: "A1", text: "hello! how much is a cut?", name: "Inès", at: new Date().toISOString() });
    const out = gatewaySends();
    assert.equal(out.length, 1);
    assert.equal(out[0].thread, "33600000001");
    const [cust] = await db.select().from(schema.customers).where(and(eq(schema.customers.businessId, x.business.id), eq(schema.customers.whatsappId, "33600000001")));
    assert.equal(cust.name, "Inès");
    assert.equal(cust.phone, "+33600000001");
  });

  test("owner replies typed on the phone appear in the inbox and silence the agent until they go quiet", async () => {
    const x = await linked();
    await handleGatewayEvent(x.business.id, { type: "message", thread: "33600000002", id: "B1", text: "are you open Sunday?", name: "Léo", at: new Date().toISOString() });
    await handleGatewayEvent(x.business.id, { type: "echo", thread: "33600000002", id: "B2", text: "Hi Léo, yes from 10!", at: new Date().toISOString() });
    const [conv] = await db.select().from(schema.conversations).where(and(eq(schema.conversations.businessId, x.business.id), eq(schema.conversations.externalThreadId, "33600000002")));
    assert.equal(conv.humanTakeover, true);
    const msgs = await db.select().from(schema.messages).where(eq(schema.messages.conversationId, conv.id)).orderBy(schema.messages.createdAt);
    assert.deepEqual(msgs.map((m) => m.role), ["customer", "agent", "owner"]);
    sent.length = 0;
    const r = await handleInbound({ business: x.business, channel: "whatsapp", threadId: "33600000002", text: "great thanks", externalMessageId: "B3", customer: null });
    assert.equal(r.skipped, "human_takeover");
    assert.equal(gatewaySends().length, 0);
    await db.update(schema.conversations).set({ humanActiveAt: new Date(Date.now() - 13 * 3600_000) }).where(eq(schema.conversations.id, conv.id));
    const r2 = await handleInbound({ business: x.business, channel: "whatsapp", threadId: "33600000002", text: "one more question", externalMessageId: "B4", customer: null });
    assert.equal(r2.skipped, undefined);
  });

  test("messages delivered late after a reconnect are stored but not answered", async () => {
    const x = await linked();
    await handleGatewayEvent(x.business.id, { type: "message", thread: "33600000003", id: "C1", text: "hello?", name: "Zoé", at: new Date(Date.now() - 5 * 3600_000).toISOString() });
    assert.equal(gatewaySends().length, 0);
    const [conv] = await db.select().from(schema.conversations).where(and(eq(schema.conversations.businessId, x.business.id), eq(schema.conversations.externalThreadId, "33600000003")));
    assert.ok(conv);
  });

  test("recent chat history is imported once, in order", async () => {
    const x = await linked();
    const history = { type: "history" as const, threads: [{ thread: "33611111111", name: "Camille", messages: [
      { id: "H2", fromMe: true, text: "Yes! Balayage from €240.", at: "2026-10-20T10:01:00Z" },
      { id: "H1", fromMe: false, text: "Do you do colour?", at: "2026-10-20T10:00:00Z" },
    ] }] };
    await handleGatewayEvent(x.business.id, history);
    await handleGatewayEvent(x.business.id, history); // delivered twice
    const [conv] = await db.select().from(schema.conversations).where(and(eq(schema.conversations.businessId, x.business.id), eq(schema.conversations.externalThreadId, "33611111111")));
    const msgs = await db.select().from(schema.messages).where(eq(schema.messages.conversationId, conv.id)).orderBy(schema.messages.createdAt);
    assert.deepEqual(msgs.map((m) => m.role), ["customer", "owner"]);
    assert.equal(conv.lastMessageAt.toISOString(), "2026-10-20T10:01:00.000Z");
  });

  test("unlinking from the phone disconnects the channel", async () => {
    const x = await linked();
    await handleGatewayEvent(x.business.id, { type: "disconnected", reason: "logged_out" });
    const [ch] = await db.select().from(schema.channels).where(and(eq(schema.channels.businessId, x.business.id), eq(schema.channels.kind, "whatsapp")));
    assert.equal(ch.status, "disconnected");
  });
});
