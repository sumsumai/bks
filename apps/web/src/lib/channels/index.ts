import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decryptJson } from "../crypto";
import { badRequest } from "../errors";
import { audit } from "../events";
import { newId } from "../ids";
import { entitlementsOf } from "../plans";
import { botUsername, deepLink, telegramAvailable } from "./telegram";
import { waLogout, waStartLink, whatsappAvailable } from "./whatsapp";

/** Public view of a channel: never includes credentials. */
export function publicChannel(c: schema.Channel | undefined) {
  if (!c) return null;
  return { id: c.id, kind: c.kind, status: c.status, displayName: c.displayName, publicHandle: c.publicHandle, mode: c.mode, pairing: c.status === "pairing" ? c.pairing : null, lastError: c.lastError };
}

async function upsertChannel(businessId: string, kind: "telegram" | "whatsapp", values: Partial<typeof schema.channels.$inferInsert>) {
  const [existing] = await db.select().from(schema.channels).where(and(eq(schema.channels.businessId, businessId), eq(schema.channels.kind, kind)));
  if (existing) {
    const [c] = await db.update(schema.channels).set({ lastError: null, ...values }).where(eq(schema.channels.id, existing.id)).returning();
    return c;
  }
  const [c] = await db.insert(schema.channels).values({ id: newId("chn"), businessId, kind, ...values }).returning();
  return c;
}

// ---------------------------------------------------------------- Telegram (shared platform bot)

/** Turn Telegram on for a business: customers reach it via the platform bot's deep link for its slug. */
export async function enableTelegram(business: schema.Business, userId: string) {
  if (!(await telegramAvailable())) throw badRequest("Telegram isn't available on the platform right now.");
  if (!(await entitlementsOf(business)).telegram) throw badRequest("Your plan doesn't include Telegram. See Plan & billing.");
  const link = await deepLink(business.slug);
  const channel = await upsertChannel(business.id, "telegram", { status: "connected", displayName: `@${await botUsername()}`, publicHandle: link, externalId: null, secretEnc: null, webhookSecret: null });
  await audit(business.id, { type: "user", id: userId }, "channel.connected", channel.id, { kind: "telegram" });
  return channel;
}

/** The slug is part of the Telegram link, so refresh it when the slug changes. */
export async function refreshTelegramLink(business: schema.Business) {
  const [c] = await db.select().from(schema.channels).where(and(eq(schema.channels.businessId, business.id), eq(schema.channels.kind, "telegram"), eq(schema.channels.status, "connected")));
  if (c) await db.update(schema.channels).set({ publicHandle: await deepLink(business.slug) }).where(eq(schema.channels.id, c.id));
}

// ---------------------------------------------------------------- WhatsApp (each business's own WhatsApp Business app)

/**
 * Start linking the business's WhatsApp Business app as a linked device. The gateway then posts a QR
 * code (scan from WhatsApp > Linked devices) or, when a phone number is given, an 8-character pairing
 * code to type on the phone, which is handy when the owner is on that very phone.
 */
export async function startWhatsAppLink(business: schema.Business, userId: string, pairingPhone?: string) {
  if (!(await whatsappAvailable())) throw badRequest("WhatsApp isn't available on the platform right now.");
  if (!(await entitlementsOf(business)).whatsapp) throw badRequest("Your plan doesn't include WhatsApp. See Plan & billing.");
  const phone = pairingPhone?.replace(/[^\d]/g, "");
  if (pairingPhone && (!phone || phone.length < 8)) throw badRequest("Enter the full number with country code, e.g. +33 6 12 34 56 78");
  const channel = await upsertChannel(business.id, "whatsapp", { status: "pairing", mode: "linked_device", pairing: null, lastError: null });
  await waStartLink(business.id, phone);
  await audit(business.id, { type: "user", id: userId }, "channel.linking", channel.id, { kind: "whatsapp", method: phone ? "code" : "qr" });
  return channel;
}

export async function disconnectChannel(business: schema.Business, kind: "telegram" | "whatsapp", userId: string) {
  const [c] = await db.select().from(schema.channels).where(and(eq(schema.channels.businessId, business.id), eq(schema.channels.kind, kind)));
  if (!c) return;
  // WhatsApp: unlink our device; the business keeps using WhatsApp on its phone as before.
  if (kind === "whatsapp") await waLogout(business.id).catch((e) => console.error("[whatsapp] logout", e));
  await db.update(schema.channels).set({ status: "disconnected", secretEnc: null, webhookSecret: null, pairing: null }).where(eq(schema.channels.id, c.id));
  await audit(business.id, { type: "user", id: userId }, "channel.disconnected", c.id, { kind });
}

export function channelSecret<T>(c: schema.Channel): T | null {
  return c.secretEnc ? decryptJson<T>(c.secretEnc) : null;
}
