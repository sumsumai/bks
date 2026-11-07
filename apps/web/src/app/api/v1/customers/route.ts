import { query, tenantRoute } from "@/lib/api";
import { listCustomers } from "@/lib/queries";

export const GET = tenantRoute("bookings.view", async (req, t) => ({ customers: await listCustomers(t.business.id, query(req).get("q") ?? undefined) }));
