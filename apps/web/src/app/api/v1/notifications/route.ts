import { tenantRoute } from "@/lib/api";
import { listNotifications, unreadCounts } from "@/lib/queries";

export const GET = tenantRoute("bookings.view", async (_req, t) => ({ notifications: await listNotifications(t.business.id), counts: await unreadCounts(t.business.id) }));
