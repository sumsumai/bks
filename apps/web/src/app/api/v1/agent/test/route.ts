import { z } from "zod";
import { handleInbound } from "@/lib/agent/runtime";
import { body, tenantRoute } from "@/lib/api";
import { recentMessages } from "@/lib/conversations";

/**
 * Playground: talk to your own agent as a test customer. Runs the real runtime (same tools, permissions
 * and audit) on a web conversation tagged with the owner's id, so test bookings are visible and cancellable.
 */
export const POST = tenantRoute("agent.manage", async (req, t) => {
  const { text, sessionId } = await body(req, z.object({ text: z.string().trim().min(1).max(2000), sessionId: z.string().min(4).max(64) }));
  const result = await handleInbound({ business: t.business, channel: "web", threadId: `test:${t.user.id}:${sessionId}`, text, customer: null });
  return { ...result, messages: await recentMessages(result.conversationId, 50) };
});
