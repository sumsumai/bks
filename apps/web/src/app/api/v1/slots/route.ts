import { query, tenantRoute } from "@/lib/api";
import { getSlots } from "@/lib/availability";
import { badRequest } from "@/lib/errors";

/** Owner-side availability: works for unpublished businesses and ignores minimum notice. */
export const GET = tenantRoute("bookings.view", async (req, t) => {
  const q = query(req);
  const serviceId = q.get("serviceId");
  const date = q.get("date");
  if (!serviceId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest("serviceId and date (YYYY-MM-DD) are required");
  const slots = await getSlots(t.business, { serviceId, date, staffId: q.get("staffId"), excludeBookingId: q.get("excludeBookingId") ?? undefined, ignoreNotice: true });
  return { date, timezone: t.business.timezone, slots };
});
