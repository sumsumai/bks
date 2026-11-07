import { tenantRoute } from "@/lib/api";
import { eraseCustomer } from "@/lib/gdpr";

export const POST = tenantRoute("customers.manage", async (_req, t, p) => {
  await eraseCustomer(t.business.id, p.id, t.user.id);
  return { ok: true };
});
