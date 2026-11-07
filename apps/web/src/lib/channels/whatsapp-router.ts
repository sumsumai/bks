import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { handleInbound } from "../agent/runtime";
import { findOrCreateCustomer } from "../bookings";
import { appendMessage, getOrCreateConversation } from "../conversations";
import { audit, notifyBusiness } from "../events";
import { newId } from "../ids";
import { getSetting } from "../settings";
import { waPhoneOfThread, waTyping } from "./whatsapp";

/** Events posted by the WhatsApp gateway (apps/wa-gateway/src/events.ts). */
export type GatewayEvent =
  | { type: "qr"; qr: string }
  | { type: "pairing_code"; code: string; phone: string }
  | { type: "connected"; phone: string; name: string }
  | { type: "disconnected"; reason: "logged_out" | "forbidden" | "pairing_expired" }
  | { type: "error"; message: string }
  | { type: "message"; thread: string; id: string; text: string; name: string; at: string }
  | { type: "echo"; thread: string; id: string; text: string; at: string }
  | { type: "history"; threads: { thread: string; name: string; messages: { id: string; fromMe: boolean; text: string; at: string }[] }[] };


async function customerFor(businessId: string, thread: string, name: string) {
  const phone = waPhoneOfThread(thread);
  return findOrCreateCustomer(businessId, { name: name || phone || "WhatsApp customer", whatsappId: thread, phone });
}

export async function handleGatewayEvent(businessId: string, e: GatewayEvent) {
  const [business] = await db.select().from(schema.businesses).where(eq(schema.businesses.id, businessId));
  if (!business) return;
  const [channel] = await db.select().from(schema.channels).where(and(eq(schema.channels.businessId, businessId), eq(schema.channels.kind, "whatsapp")));
  const setChannel = (values: Partial<typeof schema.channels.$inferInsert>) =>
    channel
      ? db.update(schema.channels).set(values).where(eq(schema.channels.id, channel.id))
      : db.insert(schema.channels).values({ id: newId("chn"), businessId, kind: "whatsapp", mode: "linked_device", ...values });

  switch (e.type) {
    case "qr":
      await setChannel({ status: "pairing", pairing: { qr: e.qr, at: new Date().toISOString() }, lastError: null });
      return;
    case "pairing_code":
      await setChannel({ status: "pairing", pairing: { code: e.code, phone: e.phone, at: new Date().toISOString() }, lastError: null });
      return;
    case "error":
      await setChannel({ lastError: e.message.slice(0, 500) });
      return;
    case "connected": {
      await setChannel({ status: "connected", mode: "linked_device", externalId: e.phone, publicHandle: e.phone, displayName: [e.name, e.phone && `+${e.phone}`].filter(Boolean).join(" · "), pairing: null, lastError: null });
      await audit(businessId, { type: "system" }, "channel.connected", channel?.id, { kind: "whatsapp", phone: e.phone });
      if (channel?.status !== "connected") await notifyBusiness(businessId, { kind: "channel.connected", title: "WhatsApp linked", body: `Your assistant now answers on +${e.phone}.`, href: "/app/channels" });
      return;
    }
    case "disconnected": {
      const why = { logged_out: "WhatsApp was unlinked from your phone.", forbidden: "WhatsApp refused the connection for this number.", pairing_expired: "The linking code expired before it was used." }[e.reason];
      await setChannel({ status: e.reason === "forbidden" ? "error" : "disconnected", pairing: null, lastError: why });
      await audit(businessId, { type: "system" }, "channel.disconnected", channel?.id, { kind: "whatsapp", reason: e.reason });
      if (e.reason !== "pairing_expired") await notifyBusiness(businessId, { kind: "channel.disconnected", title: "WhatsApp disconnected", body: `${why} Link it again from Channels.`, href: "/app/channels" });
      return;
    }
    case "message": {
      if (channel?.status !== "connected") return;
      const customer = await customerFor(businessId, e.thread, e.name);
      // Messages delivered late after the gateway was offline are stored without an agent reply.
      const stale = Date.now() - new Date(e.at).getTime() > (await getSetting("whatsapp.staleMinutes")) * 60_000;
      if (!stale) void waTyping(businessId, e.thread);
      await handleInbound({ business, channel: "whatsapp", threadId: e.thread, text: e.text, externalMessageId: e.id, customer, noReply: stale });
      return;
    }
    case "echo": {
      // The owner wrote from their own WhatsApp (phone, WhatsApp Web…): show it, and let the human lead.
      const customer = await customerFor(businessId, e.thread, "");
      const conv = await getOrCreateConversation(businessId, "whatsapp", e.thread, customer.id);
      const stored = await appendMessage(conv, "owner", e.text, { externalId: e.id });
      if (stored && !conv.humanTakeover) await db.update(schema.conversations).set({ humanTakeover: true }).where(eq(schema.conversations.id, conv.id));
      return;
    }
    case "history": {
      // Recent chats synced at link time, so the agent and the inbox have context from day one.
      for (const t of e.threads) {
        const customer = await customerFor(businessId, t.thread, t.name);
        const conv = await getOrCreateConversation(businessId, "whatsapp", t.thread, customer.id);
        for (const m of t.messages) {
          await db
            .insert(schema.messages)
            .values({ id: newId("msg"), businessId, conversationId: conv.id, role: m.fromMe ? "owner" : "customer", content: m.text, externalId: m.id, createdAt: new Date(m.at) })
            .onConflictDoNothing();
        }
        await db
          .update(schema.conversations)
          .set({ lastMessageAt: sql`(select max(created_at) from messages where conversation_id = ${conv.id})` })
          .where(eq(schema.conversations.id, conv.id));
      }
      return;
    }
  }
}
