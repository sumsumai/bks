import { tenantRoute } from "@/lib/api";
import { businessMetrics } from "@/lib/metrics";
import { listActions, listBookings, unreadCounts } from "@/lib/queries";
import { addDays, todayIn, zonedToUtc } from "@/lib/time";

export const GET = tenantRoute("bookings.view", async (_req, t) => {
  const tz = t.business.timezone;
  const today = todayIn(tz);
  const [metrics, todayBookings, approvals, counts] = await Promise.all([
    businessMetrics(t.business.id, 30),
    listBookings(t.business.id, { from: zonedToUtc(today, 0, tz), to: zonedToUtc(addDays(today, 1), 0, tz), status: ["pending", "confirmed", "completed", "no_show"] }),
    listActions(t.business.id, { status: "pending_approval", limit: 10 }),
    unreadCounts(t.business.id),
  ]);
  return { metrics, today: todayBookings, approvals, counts };
});
