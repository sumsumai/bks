import { tenantRoute } from "@/lib/api";
import { audit } from "@/lib/events";
import { exportCustomer } from "@/lib/gdpr";

export const GET = tenantRoute("customers.manage", async (_req, t, p) => {
  const data = await exportCustomer(t.business.id, p.id);
  await audit(t.business.id, { type: "user", id: t.user.id }, "customer.exported", p.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="customer-${p.id}.json"` },
  });
});
