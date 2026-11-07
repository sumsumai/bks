import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { randomId, newId } from "../ids";
import { audit } from "../events";
import { defaultPermissions } from "./tools";

export const DEFAULT_PERSONA: schema.AgentPersona = {
  tone: "warm",
  language: "en",
  formality: "neutral",
  emoji: false,
  greeting: "",
  signature: "",
};

/**
 * Provision the business's NanoClaw agent: an isolated runtime namespace (runtimeRef), default persona,
 * permissions and a starter knowledge base. Idempotent: returns the existing agent if there is one.
 */
export async function provisionAgent(business: schema.Business, opts: { persona?: Partial<schema.AgentPersona>; actorUserId?: string } = {}) {
  const [existing] = await db.select().from(schema.agents).where(eq(schema.agents.businessId, business.id));
  if (existing) return existing;
  const [agent] = await db
    .insert(schema.agents)
    .values({
      id: newId("agt"),
      businessId: business.id,
      name: `${business.name.split(/\s+/)[0]} Assistant`,
      status: "active",
      persona: { ...DEFAULT_PERSONA, language: business.locale || "en", ...opts.persona },
      permissions: defaultPermissions(),
      // Empty = follow the platform default model (Admin → Settings → AI).
      model: "",
      runtimeRef: `ncl_${randomId(20)}`,
      escalationKeywords: "lawyer, injury, allergic reaction, chargeback",
      provisionedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning();
  if (!agent) {
    const [again] = await db.select().from(schema.agents).where(eq(schema.agents.businessId, business.id));
    return again;
  }
  // Web chat is always available as a channel; messaging channels are connected by the owner.
  await db.insert(schema.channels).values({ id: newId("chn"), businessId: business.id, kind: "web", status: "connected", displayName: "Booking page chat" }).onConflictDoNothing();
  await audit(business.id, { type: opts.actorUserId ? "user" : "system", id: opts.actorUserId }, "agent.provisioned", agent.id, { runtimeRef: agent.runtimeRef });
  return agent;
}
