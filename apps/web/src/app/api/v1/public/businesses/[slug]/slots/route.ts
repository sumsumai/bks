import { publicRoute, query } from "@/lib/api";
import { getSlots } from "@/lib/availability";
import { badRequest } from "@/lib/errors";
import { businessForRequest } from "@/lib/public";

export const GET = publicRoute(async (req, p) => {
  const q = query(req);
  const serviceId = q.get("serviceId");
  const date = q.get("date");
  if (!serviceId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest("serviceId and date (YYYY-MM-DD) are required");
  const business = await businessForRequest(req, p.slug);
  const slots = await getSlots(business, { serviceId, date, staffId: q.get("staffId") });
  return { date, timezone: business.timezone, slots };
});
