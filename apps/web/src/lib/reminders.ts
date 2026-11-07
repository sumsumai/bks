import "server-only";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { messageCustomer } from "./conversations";
import { getSettings } from "./settings";
import { formatDateTime } from "./time";

/**
 * Send appointment reminders that are due. `lookaheadSlackHours` widens the window for schedulers that
 * run rarely: every 10 minutes → 2h of slack; once a day (Vercel Hobby) → 24h, so nothing is missed.
 * Each booking is claimed before sending, so overlapping runs never double-send.
 */
export async function sendDueReminders(lookaheadSlackHours = 2) {
  const settings = await getSettings();
  if (!settings["reminders.enabled"]) return { due: 0, sent: 0, disabled: true };
  const hours = settings["reminders.hoursBefore"];
  const now = Date.now();
  const due = await db
    .select({ booking: schema.bookings, business: schema.businesses, service: schema.services.name })
    .from(schema.bookings)
    .innerJoin(schema.businesses, eq(schema.businesses.id, schema.bookings.businessId))
    .innerJoin(schema.services, eq(schema.services.id, schema.bookings.serviceId))
    .where(
      and(
        eq(schema.bookings.status, "confirmed"),
        isNull(schema.bookings.reminderSentAt),
        gt(schema.bookings.startsAt, new Date(now + 2 * 3600_000)),
        lt(schema.bookings.startsAt, new Date(now + (hours + lookaheadSlackHours) * 3600_000)),
      ),
    )
    .limit(1000);

  let sent = 0;
  for (const { booking, business, service } of due) {
    const [claimed] = await db
      .update(schema.bookings)
      .set({ reminderSentAt: new Date() })
      .where(and(eq(schema.bookings.id, booking.id), isNull(schema.bookings.reminderSentAt)))
      .returning({ id: schema.bookings.id });
    if (!claimed) continue;
    const link = `${settings["general.appUrl"]}/manage/${booking.manageToken}`;
    const ok = await messageCustomer(
      business.id,
      booking.customerId,
      `Reminder: ${service} at ${business.name}, ${formatDateTime(booking.startsAt, business.timezone)}. Need to change it? ${link}`,
      { channels: settings["reminders.whatsapp"] ? undefined : ["telegram", "web"] },
    );
    if (ok) sent++;
  }
  return { due: due.length, sent };
}

/** Vercel Cron and our own schedulers send `Authorization: Bearer $CRON_SECRET`. */
export function cronAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = req.headers.get("authorization") ?? "";
  return auth.length === secret.length + 7 && auth === `Bearer ${secret}`;
}
