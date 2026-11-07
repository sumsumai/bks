import type { Boom } from "@hapi/boom";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  getContentType,
  isJidBroadcast,
  isJidGroup,
  isJidNewsletter,
  isJidStatusBroadcast,
  isLidUser,
  isPnUser,
  jidDecode,
  makeCacheableSignalKeyStore,
  normalizeMessageContent,
  type WAMessage,
  type WASocket,
} from "baileys";
import pino from "pino";
import { usePostgresAuthState } from "./auth-state.js";
import { emit } from "./events.js";

/**
 * One Baileys socket per business: the business's own WhatsApp Business app, linked as a device
 * (like WhatsApp Web). Customer messages go to the web app's agent pipeline; replies the owner types
 * on their phone come back as "echo" events so the inbox and the agent see them.
 */

const logger = pino({ level: process.env.BAILEYS_LOG_LEVEL ?? "warn" });
const HISTORY_DAYS = Number(process.env.WA_HISTORY_DAYS ?? 30);

type Session = {
  businessId: string;
  sock: WASocket;
  status: "connecting" | "pairing" | "open" | "closed";
  phone?: string;
  pairingPhone?: string;
  pairingRequested?: boolean;
  stopped?: boolean;
  retries: number;
  /** Ids of messages this gateway sent, so they aren't mistaken for the owner typing on the phone. */
  sentIds: Set<string>;
};

const sessions = new Map<string, Session>();

export const sessionStatus = () =>
  [...sessions.values()].map((s) => ({ businessId: s.businessId, status: s.status, phone: s.phone }));

/** A customer thread id is the phone number in digits, or "lid:<id>" when WhatsApp only gives a LID. */
export function jidForThread(thread: string) {
  return thread.startsWith("lid:") ? `${thread.slice(4)}@lid` : `${thread.replace(/[^\d]/g, "")}@s.whatsapp.net`;
}

async function threadFor(sock: WASocket, jid: string, alt?: string | null): Promise<string | null> {
  if (!jid || isJidGroup(jid) || isJidBroadcast(jid) || isJidStatusBroadcast(jid) || isJidNewsletter(jid)) return null;
  if (isPnUser(jid)) return jidDecode(jid)?.user ?? null;
  if (alt && isPnUser(alt)) return jidDecode(alt)?.user ?? null;
  if (isLidUser(jid)) {
    const pn = await sock.signalRepository.lidMapping.getPNForLID(jid).catch(() => null);
    if (pn) return jidDecode(pn)?.user ?? null;
    return `lid:${jidDecode(jid)?.user}`;
  }
  return null;
}

function textOf(m: WAMessage): string | null {
  const content = normalizeMessageContent(m.message);
  if (!content) return null;
  const type = getContentType(content);
  if (!type) return null;
  switch (type) {
    case "conversation":
      return content.conversation ?? null;
    case "extendedTextMessage":
      return content.extendedTextMessage?.text ?? null;
    case "imageMessage":
      return content.imageMessage?.caption ? `[photo] ${content.imageMessage.caption}` : "[photo]";
    case "videoMessage":
      return content.videoMessage?.caption ? `[video] ${content.videoMessage.caption}` : "[video]";
    case "documentMessage":
      return `[document] ${content.documentMessage?.fileName ?? ""}`.trim();
    case "audioMessage":
      return "[voice message]";
    case "locationMessage":
      return "[location]";
    case "contactMessage":
      return `[contact] ${content.contactMessage?.displayName ?? ""}`.trim();
    case "buttonsResponseMessage":
      return content.buttonsResponseMessage?.selectedDisplayText ?? null;
    case "listResponseMessage":
      return content.listResponseMessage?.title ?? null;
    default:
      return null; // reactions, protocol messages, polls, stickers…
  }
}

const ts = (m: WAMessage) => new Date(Number(m.messageTimestamp ?? Date.now() / 1000) * 1000);

export async function startSession(businessId: string, opts: { pairingPhone?: string } = {}): Promise<{ status: string }> {
  const existing = sessions.get(businessId);
  if (existing && !existing.stopped && existing.status !== "closed") {
    if (opts.pairingPhone && existing.status !== "open" && !existing.pairingRequested) {
      existing.pairingPhone = opts.pairingPhone.replace(/[^\d]/g, "");
      await requestCode(existing);
    }
    return { status: existing.status };
  }

  const { state, saveCreds, clear } = await usePostgresAuthState(businessId);
  const sock = makeWASocket({
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    logger,
    browser: Browsers.macOS("BKS Assistant"),
    // Keep the owner's phone getting notifications: we never present as "online".
    markOnlineOnConnect: false,
    syncFullHistory: false,
    getMessage: async () => undefined,
  });
  const s: Session = {
    businessId,
    sock,
    status: state.creds.registered ? "connecting" : "pairing",
    pairingPhone: opts.pairingPhone?.replace(/[^\d]/g, ""),
    retries: existing?.retries ?? 0,
    sentIds: existing?.sentIds ?? new Set(),
  };
  sessions.set(businessId, s);

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (u) => {
    if (u.qr) {
      s.status = "pairing";
      if (s.pairingPhone) await requestCode(s);
      else await emit(businessId, { type: "qr", qr: u.qr });
    }
    if (u.connection === "open") {
      s.status = "open";
      s.retries = 0;
      s.phone = jidDecode(sock.user?.id)?.user;
      await emit(businessId, { type: "connected", phone: s.phone ?? "", name: sock.user?.name ?? sock.user?.verifiedName ?? "" });
    }
    if (u.connection === "close") {
      s.status = "closed";
      const code = (u.lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      if (s.stopped) return;
      if (code === DisconnectReason.loggedOut || code === DisconnectReason.forbidden) {
        // Unlinked from the phone (Linked devices > Log out) or banned: forget the session.
        sessions.delete(businessId);
        await clear();
        await emit(businessId, { type: "disconnected", reason: code === DisconnectReason.forbidden ? "forbidden" : "logged_out" });
        return;
      }
      if (!state.creds.registered && s.retries >= 3) {
        // Pairing was never completed (QR expired several times).
        sessions.delete(businessId);
        await clear();
        await emit(businessId, { type: "disconnected", reason: "pairing_expired" });
        return;
      }
      s.retries++;
      const delay = code === DisconnectReason.restartRequired ? 0 : Math.min(60_000, 2_000 * 2 ** Math.min(s.retries, 5));
      setTimeout(() => void startSession(businessId, { pairingPhone: s.pairingPhone }).catch((e) => logger.error(e)), delay);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify" && type !== "append") return;
    for (const m of messages) {
      try {
        const jid = m.key.remoteJid;
        if (!jid || !m.message) continue;
        const thread = await threadFor(sock, jid, m.key.remoteJidAlt);
        const text = textOf(m);
        if (!thread || !text || !m.key.id) continue;
        if (m.key.fromMe) {
          if (s.sentIds.has(m.key.id)) continue; // our own agent/inbox reply
          await emit(businessId, { type: "echo", thread, id: m.key.id, text, at: ts(m).toISOString() });
        } else {
          await emit(businessId, { type: "message", thread, id: m.key.id, text, name: m.pushName ?? "", at: ts(m).toISOString() });
        }
      } catch (e) {
        logger.error({ err: e }, "failed to forward message");
      }
    }
  });

  // Recent chats delivered right after linking: imported once so the agent and the inbox have context.
  sock.ev.on("messaging-history.set", async ({ messages }) => {
    const since = Date.now() - HISTORY_DAYS * 86400_000;
    const threads = new Map<string, { thread: string; name: string; messages: { id: string; fromMe: boolean; text: string; at: string }[] }>();
    for (const m of messages) {
      const jid = m.key.remoteJid;
      if (!jid || !m.key.id || ts(m).getTime() < since) continue;
      const thread = await threadFor(sock, jid, m.key.remoteJidAlt);
      const text = textOf(m);
      if (!thread || !text) continue;
      const t = threads.get(thread) ?? { thread, name: "", messages: [] };
      if (!m.key.fromMe && m.pushName) t.name = m.pushName;
      t.messages.push({ id: m.key.id, fromMe: Boolean(m.key.fromMe), text, at: ts(m).toISOString() });
      threads.set(thread, t);
    }
    const all = [...threads.values()];
    for (let i = 0; i < all.length; i += 25) await emit(businessId, { type: "history", threads: all.slice(i, i + 25) });
  });

  return { status: s.status };
}

async function requestCode(s: Session) {
  if (!s.pairingPhone || s.pairingRequested) return;
  s.pairingRequested = true;
  try {
    const code = await s.sock.requestPairingCode(s.pairingPhone);
    await emit(s.businessId, { type: "pairing_code", code, phone: s.pairingPhone });
  } catch (e) {
    s.pairingRequested = false;
    logger.error({ err: e }, "pairing code request failed");
    await emit(s.businessId, { type: "error", message: "Couldn't get a pairing code for that number. Check the number (with country code) and try again." });
  }
}

export async function stopSession(businessId: string) {
  const s = sessions.get(businessId);
  if (!s) return;
  s.stopped = true;
  s.sock.end(undefined);
  sessions.delete(businessId);
}

/** Unlink the device from the business's WhatsApp and forget its keys. */
export async function logoutSession(businessId: string) {
  const s = sessions.get(businessId);
  const { clear } = await usePostgresAuthState(businessId);
  if (s) {
    s.stopped = true;
    await s.sock.logout().catch(() => {});
    sessions.delete(businessId);
  }
  await clear();
}

function live(businessId: string) {
  const s = sessions.get(businessId);
  if (!s || s.status !== "open") throw Object.assign(new Error("WhatsApp is not connected for this business"), { status: 409 });
  return s;
}

export async function sendText(businessId: string, thread: string, text: string) {
  const s = live(businessId);
  const jid = jidForThread(thread);
  await s.sock.sendPresenceUpdate("paused", jid).catch(() => {});
  const sent = await s.sock.sendMessage(jid, { text });
  const id = sent?.key.id;
  if (id) {
    s.sentIds.add(id);
    if (s.sentIds.size > 5000) s.sentIds.delete(s.sentIds.values().next().value!);
  }
  return { id };
}

export async function sendTyping(businessId: string, thread: string) {
  const s = live(businessId);
  await s.sock.sendPresenceUpdate("composing", jidForThread(thread));
}
