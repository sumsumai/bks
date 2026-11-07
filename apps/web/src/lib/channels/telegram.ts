import "server-only";

import { getSettings } from "../settings";

// Telegram runs as ONE platform bot shared by every business, configured in /admin/telegram. Customers
// reach a business through t.me/<bot>?start=<business-slug>; see telegram-router.ts for routing.

const API = "https://api.telegram.org";

/** A token is set (the bot can talk). */
export const telegramConfigured = async () => Boolean((await getSettings())["telegram.botToken"]);

/** Businesses may turn Telegram on: the bot is configured and the platform switch is on. */
export async function telegramAvailable() {
  const s = await getSettings();
  return Boolean(s["telegram.enabled"] && (s["telegram.botToken"] || s["telegram.botUsername"]));
}

async function token(override?: string) {
  const t = override ?? (await getSettings())["telegram.botToken"];
  if (!t) throw new Error("The Telegram bot token isn't configured (Admin → Telegram)");
  return t;
}

async function call<T>(method: string, body?: unknown, tokenOverride?: string): Promise<T> {
  const res = await fetch(`${API}/bot${await token(tokenOverride)}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description ?? res.status}`);
  return json.result;
}

let cachedUsername: string | null = null;

/** The platform bot's @username (saved in settings when the token is saved, else getMe, cached). */
export async function botUsername(): Promise<string> {
  const saved = (await getSettings())["telegram.botUsername"]?.replace(/^@/, "");
  if (saved) return saved;
  if (cachedUsername) return cachedUsername;
  const me = await call<{ username: string }>("getMe");
  cachedUsername = me.username;
  return me.username;
}

export const resetTelegramCache = () => void (cachedUsername = null);

export type BotInfo = { id: number; username: string; first_name: string; can_join_groups?: boolean };

/** Validate a token without saving it. */
export const telegramGetMe = (tokenOverride?: string) => call<BotInfo>("getMe", undefined, tokenOverride);

export const telegramSetProfile = async (p: { name?: string; description?: string; shortDescription?: string }) => {
  if (p.name !== undefined) await call("setMyName", { name: p.name });
  if (p.description !== undefined) await call("setMyDescription", { description: p.description });
  if (p.shortDescription !== undefined) await call("setMyShortDescription", { short_description: p.shortDescription });
};

export async function telegramGetProfile() {
  const [name, description, short] = await Promise.all([
    call<{ name: string }>("getMyName").catch(() => ({ name: "" })),
    call<{ description: string }>("getMyDescription").catch(() => ({ description: "" })),
    call<{ short_description: string }>("getMyShortDescription").catch(() => ({ short_description: "" })),
  ]);
  return { name: name.name, description: description.description, shortDescription: short.short_description };
}

export const telegramDeleteWebhook = () => call<boolean>("deleteWebhook", { drop_pending_updates: false });

/** Deep link that opens the bot already bound to one business. Start payloads allow [A-Za-z0-9_-], max 64. */
export async function deepLink(slug: string) {
  return `https://t.me/${await botUsername()}?start=${slug.slice(0, 64)}`;
}

export type InlineButton = { text: string; callback_data: string };

export const telegramSend = (chatId: string, text: string, buttons?: InlineButton[][]) =>
  call<{ message_id: number }>("sendMessage", { chat_id: chatId, text, ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}) });

export const telegramTyping = (chatId: string) => call<boolean>("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => false);

export const telegramAnswerCallback = (id: string, text?: string) => call<boolean>("answerCallbackQuery", { callback_query_id: id, text }).catch(() => false);

/** Point the platform bot at our webhook. Telegram echoes the secret in X-Telegram-Bot-Api-Secret-Token. */
export async function registerTelegramWebhook() {
  const s = await getSettings();
  const secret = s["telegram.webhookSecret"];
  if (!secret) throw new Error("The Telegram webhook secret isn't set (save the bot token again to generate one)");
  const appUrl = s["general.appUrl"] ?? "";
  const url = `${appUrl.replace(/\/$/, "")}/api/webhooks/telegram`;
  if (!url.startsWith("https://")) throw new Error(`Telegram needs a public https URL (APP_URL is ${appUrl})`);
  await call<boolean>("setWebhook", { url, secret_token: secret, allowed_updates: ["message", "callback_query"] });
  await call<boolean>("setMyCommands", {
    commands: [
      { command: "switch", description: "Talk to another business" },
      { command: "start", description: "Start over" },
    ],
  });
  return { url, bot: await botUsername() };
}

export async function telegramWebhookInfo() {
  return call<{ url: string; pending_update_count: number; last_error_message?: string; last_error_date?: number }>("getWebhookInfo");
}

export type TelegramUpdate =
  | { kind: "message"; chatId: string; messageId: string; text: string; name: string; startPayload: string | null; command: string | null }
  | { kind: "callback"; chatId: string; callbackId: string; data: string; name: string };

export function parseTelegramUpdate(update: unknown): TelegramUpdate | null {
  const u = update as { message?: Record<string, any>; callback_query?: Record<string, any> };
  const nameOf = (from: any) => [from?.first_name, from?.last_name].filter(Boolean).join(" ") || from?.username || "Telegram user";
  if (u?.callback_query) {
    const cq = u.callback_query;
    if (cq.message?.chat?.type !== "private" || typeof cq.data !== "string") return null;
    return { kind: "callback", chatId: String(cq.message.chat.id), callbackId: String(cq.id), data: cq.data, name: nameOf(cq.from) };
  }
  const msg = u?.message;
  if (!msg || typeof msg.text !== "string" || msg.chat?.type !== "private") return null;
  const cmd = /^\/(\w+)(?:@\w+)?(?:\s+(.+))?$/.exec(msg.text.trim());
  return {
    kind: "message",
    chatId: String(msg.chat.id),
    messageId: String(msg.message_id),
    text: msg.text,
    name: nameOf(msg.from),
    command: cmd ? cmd[1].toLowerCase() : null,
    startPayload: cmd && cmd[1].toLowerCase() === "start" ? (cmd[2]?.trim() ?? null) : null,
  };
}
