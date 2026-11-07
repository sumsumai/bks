import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getAgent } from "@/lib/agent/runtime";
import { TOOLS, modeFor } from "@/lib/agent/tools";
import { body, tenantRoute } from "@/lib/api";
import { publicChannel } from "@/lib/channels";
import { notFound } from "@/lib/errors";
import { audit } from "@/lib/events";
import { businessMetrics } from "@/lib/metrics";
import { AgentPatch } from "@/lib/validators";

async function view(businessId: string) {
  const agent = await getAgent(businessId);
  if (!agent) throw notFound("Agent");
  const channels = await db.select().from(schema.channels).where(eq(schema.channels.businessId, businessId));
  return {
    agent: { ...agent, runtimeRef: undefined },
    tools: TOOLS.map((t) => ({ name: t.name, label: t.label, mode: modeFor(agent, t.name), locked: Boolean(t.locked) })),
    channels: channels.map(publicChannel),
  };
}

export const GET = tenantRoute("inbox.reply", async (_req, t) => ({ ...(await view(t.business.id)), metrics: await businessMetrics(t.business.id, 30) }));

export const PATCH = tenantRoute("agent.manage", async (req, t) => {
  const patch = await body(req, AgentPatch);
  const agent = await getAgent(t.business.id);
  if (!agent) throw notFound("Agent");
  const set: Partial<schema.Agent> = { ...patch } as Partial<schema.Agent>;
  if (patch.permissions) set.permissions = { ...agent.permissions, ...patch.permissions };
  await db.update(schema.agents).set(set).where(eq(schema.agents.id, agent.id));
  await audit(t.business.id, { type: "user", id: t.user.id }, "agent.updated", agent.id, { fields: Object.keys(patch) });
  return view(t.business.id);
});
