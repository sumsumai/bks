// Formatting in the business's timezone and currency (Intl, supported by Hermes).

export function tzOffsetMinutes(instant: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) p[part.type] = part.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/** UTC instant for local `date` (YYYY-MM-DD) at `minute` past midnight in `tz`. */
export function zonedToUtc(date: string, minute: number, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minute);
  let result = guess - tzOffsetMinutes(new Date(guess), tz) * 60000;
  const second = tzOffsetMinutes(new Date(result), tz);
  result = guess - second * 60000;
  return new Date(result);
}

export function localDate(instant: Date, tz: string): string {
  const shifted = new Date(instant.getTime() + tzOffsetMinutes(instant, tz) * 60000);
  return shifted.toISOString().slice(0, 10);
}

export const todayIn = (tz: string) => localDate(new Date(), tz);

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function dayRange(date: string, tz: string) {
  return { from: zonedToUtc(date, 0, tz).toISOString(), to: zonedToUtc(addDays(date, 1), 0, tz).toISOString() };
}

export const fmtTime = (iso: string | Date, tz: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export const fmtDate = (iso: string | Date, tz: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...opts }).format(new Date(iso));

export const fmtDateTime = (iso: string | Date, tz: string) => `${fmtDate(iso, tz)} · ${fmtTime(iso, tz)}`;

/** Weekday/day label for a local YYYY-MM-DD date (no timezone shift: the date is already local). */
export function dateLabel(date: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric" }) {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

export function fmtMoney(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export const minutesToHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function hhmmToMinutes(s: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 24 || m > 59 || (h === 24 && m > 0)) return null;
  return h * 60 + m;
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
  no_show: "No-show",
};

export const SOURCE_LABEL: Record<string, string> = {
  web: "Booking page",
  owner: "Team",
  agent: "AI agent",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
};

export const CHANNEL_LABEL: Record<string, string> = { whatsapp: "WhatsApp", telegram: "Telegram", web: "Web chat" };

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";
