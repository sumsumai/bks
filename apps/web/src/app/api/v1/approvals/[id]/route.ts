import { z } from "zod";
import { decideAction } from "@/lib/agent/approvals";
import { body, tenantRoute } from "@/lib/api";

export const POST = tenantRoute("agent.approve", async (req, t, p) => {
  const { decision, note } = await body(req, z.object({ decision: z.enum(["approve", "reject"]), note: z.string().max(500).optional() }));
  return { action: await decideAction(t.business, p.id, decision === "approve", t.user.id, note) };
});
