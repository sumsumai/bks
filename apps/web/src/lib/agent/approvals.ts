import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { messageCustomer } from "../conversations";
import { conflict, notFound } from "../errors";
import { audit } from "../events";
import { TOOL_BY_NAME, type AgentContext } from "./tools";

/** Approve or reject a queued agent action. Approval executes the tool exactly as the agent requested it. */
export async function decideAction(business: schema.Business, actionId: string, approve: boolean, userId: string, note?: string) {
  // Claim the action atomically so a double tap (web + mobile) can't execute it twice.
  const [action] = await db
    .update(schema.agentActions)
    .set({ status: approve ? "approved" : "rejected", decidedBy: userId, decidedAt: new Date() })
    .where(and(eq(schema.agentActions.id, actionId), eq(schema.agentActions.businessId, business.id), eq(schema.agentActions.status, "pending_approval")))
    .returning();
  if (!action) {
    const [exists] = await db.select({ id: schema.agentActions.id }).from(schema.agentActions).where(and(eq(schema.agentActions.id, actionId), eq(schema.agentActions.businessId, business.id)));
    if (!exists) throw notFound("Action");
    throw conflict("already_decided", "This action was already decided");
  }
  await audit(business.id, { type: "user", id: userId }, approve ? "action.approved" : "action.rejected", action.id, { tool: action.tool, note });

  const [conv] = action.conversationId ? await db.select().from(schema.conversations).where(eq(schema.conversations.id, action.conversationId)) : [];
  const customerId = conv?.customerId;

  if (!approve) {
    if (customerId) await messageCustomer(business.id, customerId, `Update from ${business.name}: we weren't able to do that (“${action.summary}”).${note ? ` ${note}` : ""} A team member can help if you reply here.`);
    return { ...action, output: null };
  }

  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.id, action.agentId));
  const [customer] = customerId ? await db.select().from(schema.customers).where(eq(schema.customers.id, customerId)) : [];
  const tool = TOOL_BY_NAME.get(action.tool);
  if (!tool || !agent || !conv) {
    await db.update(schema.agentActions).set({ status: "failed", output: { error: "context_missing" } }).where(eq(schema.agentActions.id, action.id));
    throw conflict("context_missing", "The conversation for this action no longer exists");
  }
  const ctx: AgentContext = { business, agent, conversation: conv, customer: customer ?? null, setCustomer: async () => {} };
  try {
    const output = await tool.run(action.input, ctx);
    await db.update(schema.agentActions).set({ output: output as object }).where(eq(schema.agentActions.id, action.id));
    if (customerId) await messageCustomer(business.id, customerId, `Good news from ${business.name}: done ✓ (${action.summary}).`);
    return { ...action, output };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.update(schema.agentActions).set({ status: "failed", output: { error: message } }).where(eq(schema.agentActions.id, action.id));
    throw conflict("action_failed", message);
  }
}
