import { query, tenantRoute } from "@/lib/api";
import { listActions } from "@/lib/queries";

export const GET = tenantRoute("agent.approve", async (req, t) => {
  const status = (query(req).get("status") as any) || "pending_approval";
  return { actions: await listActions(t.business.id, { status: status === "all" ? undefined : status }) };
});
