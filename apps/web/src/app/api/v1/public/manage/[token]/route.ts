import { z } from "zod";
import { body, publicRoute } from "@/lib/api";
import { bookingByToken, cancelBooking, rescheduleBooking } from "@/lib/bookings";
import { notFound } from "@/lib/errors";

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel"), reason: z.string().max(500).default("") }),
  z.object({ action: z.literal("reschedule"), startsAt: z.iso.datetime() }),
]);

export const GET = publicRoute(async (_req, p) => {
  const row = await bookingByToken(p.token);
  if (!row) throw notFound("Booking");
  return {
    booking: { id: row.booking.id, status: row.booking.status, startsAt: row.booking.startsAt, priceCents: row.booking.priceCents },
    service: { id: row.service.id, name: row.service.name, durationMinutes: row.service.durationMinutes },
    staff: { name: row.staff.name },
    business: { name: row.business.name, slug: row.business.slug, timezone: row.business.timezone, currency: row.business.currency, cancellationWindowHours: row.business.policy.cancellationWindowHours },
  };
});

export const POST = publicRoute(async (req, p) => {
  const row = await bookingByToken(p.token);
  if (!row) throw notFound("Booking");
  const a = await body(req, Action);
  const actor = { type: "customer" as const, id: row.customer.id };
  if (a.action === "cancel") await cancelBooking(row.business, row.booking.id, a.reason, actor);
  else await rescheduleBooking(row.business, row.booking.id, a.startsAt, actor, { staffId: row.booking.staffId });
  return { ok: true };
});
