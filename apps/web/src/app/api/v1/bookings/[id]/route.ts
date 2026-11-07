import { z } from "zod";
import { body, tenantRoute } from "@/lib/api";
import { cancelBooking, rescheduleBooking, setBookingStatus } from "@/lib/bookings";
import { getBookingRow } from "@/lib/queries";

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm") }),
  z.object({ action: z.literal("complete") }),
  z.object({ action: z.literal("no_show") }),
  z.object({ action: z.literal("cancel"), reason: z.string().max(500).default("") }),
  z.object({ action: z.literal("reschedule"), startsAt: z.iso.datetime(), staffId: z.string().nullish(), override: z.boolean().optional() }),
]);

export const GET = tenantRoute("bookings.view", async (_req, t, p) => ({ booking: await getBookingRow(t.business.id, p.id) }));

export const PATCH = tenantRoute("bookings.manage", async (req, t, p) => {
  const a = await body(req, Action);
  const actor = { type: "user" as const, id: t.user.id };
  if (a.action === "cancel") await cancelBooking(t.business, p.id, a.reason, actor);
  else if (a.action === "reschedule") await rescheduleBooking(t.business, p.id, a.startsAt, actor, { staffId: a.staffId, override: a.override });
  else await setBookingStatus(t.business, p.id, a.action === "confirm" ? "confirmed" : a.action === "complete" ? "completed" : "no_show", actor);
  return { booking: await getBookingRow(t.business.id, p.id) };
});
