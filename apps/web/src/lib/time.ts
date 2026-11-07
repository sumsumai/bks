// Timezone helpers without a date library. Availability is defined in the business's local time
// (weekday + minutes from midnight); bookings are stored as UTC instants.

/** Offset (minutes) of `tz` from UTC at the given instant, e.g. +60 for Europe/Paris in winter. */
export function tzOffsetMinutes(instant: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(instant).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/** The UTC instant for local `date` (YYYY-MM-DD) at `minute` past local midnight in `tz`. DST-safe. */
export function zonedToUtc(date: string, minute: number, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minute);
  let offset = tzOffsetMinutes(new Date(guess), tz);
  let result = guess - offset * 60000;
  const offset2 = tzOffsetMinutes(new Date(result), tz);
  if (offset2 !== offset) {
    offset = offset2;
    result = guess - offset * 60000;
  }
  return new Date(result);
}

/** Local calendar parts of an instant in `tz`. */
export function zonedParts(instant: Date, tz: string) {
  const shifted = new Date(instant.getTime() + tzOffsetMinutes(instant, tz) * 60000);
  return {
    date: shifted.toISOString().slice(0, 10),
    weekday: shifted.getUTCDay(),
    minute: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function todayIn(tz: string): string {
  return zonedParts(new Date(), tz).date;
}

export function formatTime(instant: Date, tz: string, locale = "en-GB") {
  return new Intl.DateTimeFormat(locale, { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(instant);
}

export function formatDate(instant: Date, tz: string, locale = "en-GB", opts?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: "short", day: "numeric", month: "short", ...opts }).format(
    instant,
  );
}

export function formatDateTime(instant: Date, tz: string, locale = "en-GB") {
  return `${formatDate(instant, tz, locale)}, ${formatTime(instant, tz, locale)}`;
}

export const minutesToHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export function hhmmToMinutes(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function formatMoney(cents: number, currency: string, locale = "en-GB") {
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(
    cents / 100,
  );
}
