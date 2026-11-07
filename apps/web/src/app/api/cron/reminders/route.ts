import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { messageCustomer } from "@/lib/conversations";
import { getSettings } from "@/lib/settings";
import { safeEqual } from "@/lib/crypto";
import { formatDateTime } from "@/lib/time";

/**
 * Sends reminders ahead of appointments (Admin → Settings → Reminders) over the customer's messaging channel. Call every 10–15 minutes
 * (Vercel Cron, a k8s CronJob, …) with Authorization: Bearer $CRON_SECRET.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (process.env.NODE_ENV === "production" && (!secret || !safeEqual(auth, `Bearer ${secret}`))) return new Response("forbidden", { status: 403 });

  const settings = await getSettings();
  if (!settings["reminders.enabled"]) return Response.json({ due: 0, sent: 0, disabled: true });
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
        lt(schema.bookings.startsAt, new Date(now + (hours + 2) * 3600_000)),
      ),
    )
    .limit(500);

  let sent = 0;
  for (const { booking, business, service } of due) {
    // Claim first so overlapping cron runs never double-send.
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
      `Reminder: ${service} at ${business.name}, ${formatDateTime(booking.startsAt, business.timezone)}. Need to change it? ${link}`, { channels: settings["reminders.whatsapp"] ? undefined : ["telegram", "web"] });
    if (ok) sent++;
  }
  return Response.json({ due: due.length, sent });
}
