import "server-only";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { decryptJson, encryptJson } from "./crypto";

/**
 * Platform settings editable from /admin/settings (and /admin/telegram). Resolution order:
 * value saved in the database → environment variable (bootstrap / infra) → default.
 * Secrets are encrypted at rest and never sent back to the browser (only "set" + last 4 chars).
 */

type Kind = "string" | "secret" | "number" | "boolean" | "select";

export type SettingDef = {
  key: string;
  group: "general" | "ai" | "telegram" | "whatsapp" | "billing" | "reminders";
  label: string;
  help?: string;
  kind: Kind;
  env?: string;
  default: string | number | boolean | null;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
};

export const SETTINGS = [
  // General
  { key: "general.appUrl", group: "general", label: "Public URL", help: "Used in booking links, reminders and the Telegram webhook. Must be https in production.", kind: "string", env: "APP_URL", default: "http://localhost:3200" },
  { key: "general.signupsOpen", group: "general", label: "Business sign-ups open", help: "When off, only admins can create accounts (Users → New user).", kind: "boolean", default: true },
  { key: "general.autoPublish", group: "general", label: "New businesses can publish themselves", help: "When off, a business stays hidden from the marketplace until an admin publishes it.", kind: "boolean", default: true },
  { key: "general.supportEmail", group: "general", label: "Support email", kind: "string", default: "" },

  // AI agents
  { key: "ai.enabled", group: "ai", label: "AI agents enabled", help: "Global switch. When off, every agent stays silent and messages wait in inboxes.", kind: "boolean", default: true },
  { key: "ai.anthropicApiKey", group: "ai", label: "Anthropic API key", help: "Without a key, agents run in offline mode (rule-based replies).", kind: "secret", env: "ANTHROPIC_API_KEY", default: null },
  { key: "ai.model", group: "ai", label: "Default model", kind: "select", env: "AGENT_MODEL", default: "claude-opus-5-5", options: [
    { value: "claude-opus-5-5", label: "Claude Opus 5.5 (best)" },
    { value: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (faster, cheaper)" },
    { value: "claude-haiku-5-5", label: "Claude Haiku 5.5 (cheapest)" },
  ] },
  { key: "ai.effort", group: "ai", label: "Effort", help: "Higher effort is more careful and costs more tokens.", kind: "select", env: "AGENT_EFFORT", default: "medium", options: [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
  ] },
  { key: "ai.takeoverHours", group: "ai", label: "Hand back to the agent after (hours of owner silence)", kind: "number", env: "AGENT_TAKEOVER_TIMEOUT_HOURS", default: 12, min: 1, max: 720 },

  // Telegram (one shared bot)
  { key: "telegram.enabled", group: "telegram", label: "Telegram available to businesses", kind: "boolean", default: true },
  { key: "telegram.botToken", group: "telegram", label: "Bot token", help: "From @BotFather. Saving it checks the token with Telegram.", kind: "secret", env: "TELEGRAM_BOT_TOKEN", default: null },
  { key: "telegram.webhookSecret", group: "telegram", label: "Webhook secret", kind: "secret", env: "TELEGRAM_WEBHOOK_SECRET", default: null },
  { key: "telegram.botUsername", group: "telegram", label: "Bot username", kind: "string", env: "TELEGRAM_BOT_USERNAME", default: "" },

  // WhatsApp (linked devices through the gateway)
  { key: "whatsapp.enabled", group: "whatsapp", label: "WhatsApp linking available to businesses", kind: "boolean", default: true },
  { key: "whatsapp.gatewayUrl", group: "whatsapp", label: "Gateway URL", help: "Where the WhatsApp gateway runs, e.g. https://bks-wa-gateway.onrender.com (or http://wa-gateway:3300 inside Docker).", kind: "string", env: "WA_GATEWAY_URL", default: "" },
  { key: "whatsapp.gatewaySecret", group: "whatsapp", label: "Gateway secret", help: "The WA_GATEWAY_SECRET value configured on the gateway.", kind: "secret", env: "WA_GATEWAY_SECRET", default: null },
  { key: "whatsapp.staleMinutes", group: "whatsapp", label: "Don't auto-answer messages delivered later than (minutes)", help: "Messages that arrive late after a reconnect are stored without an agent reply.", kind: "number", env: "WA_STALE_MINUTES", default: 120, min: 5, max: 10080 },

  // Billing
  { key: "billing.stripeSecretKey", group: "billing", label: "Stripe secret key", help: "Without it, plan changes apply immediately (test mode).", kind: "secret", env: "STRIPE_SECRET_KEY", default: null },
  { key: "billing.stripeWebhookSecret", group: "billing", label: "Stripe webhook signing secret", kind: "secret", env: "STRIPE_WEBHOOK_SECRET", default: null },

  // Reminders
  { key: "reminders.enabled", group: "reminders", label: "Send appointment reminders", kind: "boolean", default: true },
  { key: "reminders.hoursBefore", group: "reminders", label: "Hours before the appointment", kind: "number", default: 24, min: 1, max: 168 },
  { key: "reminders.whatsapp", group: "reminders", label: "Send reminders on WhatsApp", help: "Proactive messages from linked WhatsApp devices raise the risk of the number being restricted. Telegram and web are unaffected.", kind: "boolean", default: true },
] as const satisfies readonly SettingDef[];

export type SettingKey = (typeof SETTINGS)[number]["key"];
type ValueOf<K extends SettingKey> = Extract<(typeof SETTINGS)[number], { key: K }>["kind"] extends "boolean"
  ? boolean
  : Extract<(typeof SETTINGS)[number], { key: K }>["kind"] extends "number"
    ? number
    : string | null;

export type Settings = { [K in SettingKey]: ValueOf<K> };

const DEFS = new Map<string, SettingDef>(SETTINGS.map((d) => [d.key, d as SettingDef]));
export const settingDef = (key: string) => DEFS.get(key);

function coerce(def: SettingDef, raw: unknown): unknown {
  if (raw === null || raw === undefined || raw === "") return def.kind === "secret" ? null : def.default;
  if (def.kind === "boolean") return raw === true || raw === "true" || raw === "1" || raw === "on";
  if (def.kind === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : def.default;
  }
  return String(raw);
}

let cache: { at: number; value: Settings } | null = null;
const TTL_MS = 5_000;

/** All settings, resolved. Cached for a few seconds per process; writes invalidate immediately. */
export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const rows = await db.select().from(schema.platformSettings);
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const out: Record<string, unknown> = {};
  for (const def of SETTINGS as readonly SettingDef[]) {
    let raw: unknown = stored.get(def.key);
    if (raw !== undefined && raw !== null && def.kind === "secret") {
      try {
        raw = decryptJson<string>(String(raw));
      } catch {
        raw = null;
      }
    }
    if (raw === undefined || raw === null) raw = def.env ? process.env[def.env] : undefined;
    // On Vercel the production domain is known without configuration.
    if ((raw === undefined || raw === "") && def.key === "general.appUrl" && process.env.VERCEL_PROJECT_PRODUCTION_URL) raw = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
    out[def.key] = coerce(def, raw);
  }
  cache = { at: Date.now(), value: out as Settings };
  return cache.value;
}

export async function getSetting<K extends SettingKey>(key: K): Promise<Settings[K]> {
  return (await getSettings())[key];
}

/** Where each value currently comes from, for the admin UI. Secrets are masked. */
export async function describeSettings() {
  const rows = await db.select().from(schema.platformSettings);
  const stored = new Map(rows.map((r) => [r.key, r]));
  const s = await getSettings();
  return (SETTINGS as readonly SettingDef[]).map((def) => {
    const row = stored.get(def.key);
    const value = s[def.key as SettingKey];
    const source: "database" | "environment" | "default" = row && row.value !== null ? "database" : def.env && process.env[def.env] ? "environment" : "default";
    return {
      ...def,
      source,
      updatedAt: row?.updatedAt ?? null,
      value: def.kind === "secret" ? null : value,
      secretSet: def.kind === "secret" ? Boolean(value) : undefined,
      secretHint: def.kind === "secret" && typeof value === "string" && value.length > 8 ? `••••${value.slice(-4)}` : undefined,
    };
  });
}

/** Save settings (validated against their definitions). `null` resets a key to env/default. */
export async function saveSettings(values: Record<string, unknown>, userId: string) {
  const keys = Object.keys(values).filter((k) => DEFS.has(k));
  for (const key of keys) {
    const def = DEFS.get(key)!;
    const raw = values[key];
    let value: unknown = raw === null ? null : coerce(def, raw);
    if (def.kind === "number" && value !== null) {
      const n = value as number;
      if ((def.min !== undefined && n < def.min) || (def.max !== undefined && n > def.max)) throw new Error(`${def.label}: must be between ${def.min} and ${def.max}`);
    }
    if (def.kind === "select" && value !== null && !def.options?.some((o) => o.value === value)) throw new Error(`${def.label}: invalid choice`);
    if (def.kind === "secret" && value !== null) value = encryptJson(String(value));
    await db
      .insert(schema.platformSettings)
      .values({ key, value, updatedBy: userId, updatedAt: new Date() })
      .onConflictDoUpdate({ target: schema.platformSettings.key, set: { value, updatedBy: userId, updatedAt: new Date() } });
  }
  cache = null;
  return keys;
}

export async function clearSettings(keys: string[]) {
  if (!keys.length) return;
  await db.delete(schema.platformSettings).where(inArray(schema.platformSettings.key, keys));
  cache = null;
}

export function invalidateSettings() {
  cache = null;
}
