import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { nextAvailableDays } from "../availability";
import { appendMessage, deliver, getOrCreateConversation, recentMessages } from "../conversations";
import { AppError } from "../errors";
import { audit, notifyBusiness } from "../events";
import { newId } from "../ids";
import { searchKnowledge } from "../knowledge";
import { formatDate, formatMoney, formatTime } from "../time";
import { escalate } from "./escalation";
import { entitlementsOf } from "../plans";
import { getSetting, getSettings, type Settings } from "../settings";
import { buildStablePrompt, buildVolatilePrompt } from "./prompt";
import { modeFor, TOOL_BY_NAME, toolsFor, type AgentContext } from "./tools";

/**
 * NanoClaw runtime: one isolated agent per business.
 *
 * Isolation model (enforced here, not by convention):
 * - An agent turn is constructed from exactly one business row; its prompt, knowledge, tools and memory
 *   are loaded with that business id and nothing else.
 * - Tools receive an AgentContext and cannot address another business or another customer's bookings.
 * - Customer memory is keyed by (business, customer). Conversations are keyed by (business, channel, thread).
 * - Every tool call is written to agent_actions (audit), and gated by the business's permission settings.
 */

const MAX_STEPS = 8;
// Server-side refusal fallback (re-runs a declined request on a recommended model) for models that support it.
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

/** Live = an Anthropic key is configured (Admin → Settings, or ANTHROPIC_API_KEY). Otherwise offline mode. */
export const isLiveMode = async () => !process.env.AGENT_OFFLINE && Boolean((await getSettings())["ai.anthropicApiKey"] || process.env.ANTHROPIC_AUTH_TOKEN);

let client: { key: string; c: Anthropic } | null = null;
async function anthropic() {
  const key = (await getSettings())["ai.anthropicApiKey"] ?? "";
  if (!client || client.key !== key) client = { key, c: key ? new Anthropic({ apiKey: key }) : new Anthropic() };
  return client.c;
}

/** Position of this conversation among the business's conversations this month (1-based). */
async function conversationRank(conv: schema.Conversation) {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  if (conv.createdAt < start) return 0; // started last month: keep serving it
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.conversations)
    .where(and(eq(schema.conversations.businessId, conv.businessId), gte(schema.conversations.createdAt, start), lte(schema.conversations.createdAt, conv.createdAt), sql`${schema.conversations.externalThreadId} not like 'test:%'`));
  return Number(r?.n ?? 0);
}

async function notifyQuotaOnce(businessId: string, limit: number) {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const [already] = await db
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.businessId, businessId), eq(schema.notifications.kind, "quota.reached"), gte(schema.notifications.createdAt, start)))
    .limit(1);
  if (!already)
    await notifyBusiness(businessId, { kind: "quota.reached", title: "AI conversation limit reached", body: `Your plan includes ${limit} assistant conversations a month. New conversations now wait for you in the inbox. Upgrade to keep your assistant answering.`, href: "/app/billing" });
}

export type InboundMessage = {
  business: schema.Business;
  channel: "whatsapp" | "telegram" | "web";
  threadId: string;
  text: string;
  externalMessageId?: string;
  customer: schema.Customer | null;
  /** Store and notify only (e.g. a message delivered hours late after a reconnect). */
  noReply?: boolean;
};

export type TurnResult = { conversationId: string; reply: string | null; skipped?: "duplicate" | "human_takeover" | "agent_paused" | "quota" };

export async function getAgent(businessId: string) {
  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.businessId, businessId));
  return agent ?? null;
}

/** Entry point for every channel: store the message, let the agent answer (unless a human has taken over), deliver. */
export async function handleInbound(msg: InboundMessage): Promise<TurnResult> {
  const conv = await getOrCreateConversation(msg.business.id, msg.channel, msg.threadId, msg.customer?.id ?? null);
  const stored = await appendMessage(conv, "customer", msg.text, { externalId: msg.externalMessageId });
  if (!stored) return { conversationId: conv.id, reply: null, skipped: "duplicate" };
  await db.insert(schema.usageEvents).values({ id: newId("use"), businessId: msg.business.id, kind: "message_in" });

  const agent = await getAgent(msg.business.id);
  const settings = await getSettings();
  // A human who stepped in (inbox, mobile app, or the WhatsApp Business app) leads the conversation.
  // If they've been quiet for a while and nothing is escalated, the agent picks it back up.
  if (conv.humanTakeover && conv.status !== "escalated" && conv.humanActiveAt && Date.now() - conv.humanActiveAt.getTime() > settings["ai.takeoverHours"] * 3600_000) {
    await db.update(schema.conversations).set({ humanTakeover: false }).where(eq(schema.conversations.id, conv.id));
    conv.humanTakeover = false;
  }
  if (conv.humanTakeover || msg.noReply) {
    await notifyBusiness(msg.business.id, { kind: "conversation.message", title: `New message from ${msg.customer?.name ?? "a customer"}`, body: msg.text.slice(0, 140), href: `/app/inbox/${conv.id}` });
    return { conversationId: conv.id, reply: null, skipped: "human_takeover" };
  }
  if (!agent || agent.status !== "active" || msg.business.suspended || !settings["ai.enabled"]) {
    return { conversationId: conv.id, reply: null, skipped: "agent_paused" };
  }
  // Monthly AI conversation allowance from the business's plan (playground tests don't count).
  const limit = (await entitlementsOf(msg.business)).maxConversationsPerMonth;
  if (limit !== null && !msg.threadId.startsWith("test:") && (await conversationRank(conv)) > limit) {
    await notifyQuotaOnce(msg.business.id, limit);
    await notifyBusiness(msg.business.id, { kind: "conversation.message", title: `New message from ${msg.customer?.name ?? "a customer"}`, body: msg.text.slice(0, 140), href: `/app/inbox/${conv.id}` });
    return { conversationId: conv.id, reply: null, skipped: "quota" };
  }

  // Owner-configured escalation keywords bypass the model entirely.
  const keywords = agent.escalationKeywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
  const hit = keywords.find((k) => msg.text.toLowerCase().includes(k));
  if (hit) {
    await escalate(msg.business, conv, `Customer mentioned “${hit}”`);
    const reply = "Thanks for your message. I've passed this to the team and someone will reply here shortly.";
    await appendMessage(conv, "agent", reply);
    await deliver(conv, reply);
    return { conversationId: conv.id, reply };
  }

  let customer = msg.customer;
  if (!customer && conv.customerId) {
    [customer] = await db.select().from(schema.customers).where(and(eq(schema.customers.id, conv.customerId), eq(schema.customers.businessId, msg.business.id)));
  }
  const ctx: AgentContext = {
    business: msg.business,
    agent,
    conversation: conv,
    customer: customer ?? null,
    async setCustomer(c) {
      ctx.customer = c;
      conv.customerId = c.id;
      await db.update(schema.conversations).set({ customerId: c.id }).where(eq(schema.conversations.id, conv.id));
    },
  };

  const started = Date.now();
  let reply: string;
  let usage = { input: 0, output: 0 };
  try {
    if (await isLiveMode()) ({ reply, usage } = await runLiveTurn(ctx, settings));
    else reply = await runOfflineTurn(ctx, msg.text);
  } catch (e) {
    console.error("[agent] turn failed", e);
    await audit(msg.business.id, { type: "agent", id: agent.id }, "agent.error", conv.id, { message: e instanceof Error ? e.message : String(e) });
    await escalate(msg.business, conv, "The assistant hit an error answering this customer");
    reply = "Sorry, I'm having trouble right now. I've asked a team member to get back to you here.";
  }

  await db.insert(schema.usageEvents).values({
    id: newId("use"),
    businessId: msg.business.id,
    kind: "agent_turn",
    inputTokens: usage.input,
    outputTokens: usage.output,
    latencyMs: Date.now() - started,
  });
  if (reply.trim()) {
    await appendMessage(conv, "agent", reply);
    await deliver(conv, reply);
  }
  return { conversationId: conv.id, reply };
}

/** Rebuild the chat as plain text turns. Owner replies are shown to the model as the business speaking. */
async function historyAsMessages(conversationId: string): Promise<Anthropic.Beta.BetaMessageParam[]> {
  const rows = await recentMessages(conversationId, 30);
  const out: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of rows) {
    if (m.role === "system") continue;
    const role = m.role === "customer" ? "user" : "assistant";
    const text = m.role === "owner" ? `[A team member replied personally] ${m.content}` : m.content;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content = `${last.content as string}\n\n${text}`;
    else out.push({ role, content: text });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

async function runLiveTurn(ctx: AgentContext, settings: Settings) {
  const { business, agent } = ctx;
  const stable = await buildStablePrompt(business, agent);
  const volatile = await buildVolatilePrompt(business, ctx.customer);
  const messages = await historyAsMessages(ctx.conversation.id);
  const tools = toolsFor(agent);
  // An agent without its own model follows the platform default (Admin → Settings → AI).
  const model = agent.model || settings["ai.model"] || "claude-opus-5-5";
  const client = await anthropic();
  const usage = { input: 0, output: 0 };

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      system: [
        { type: "text", text: stable, cache_control: { type: "ephemeral" } },
        { type: "text", text: volatile },
      ],
      tools,
      messages,
      output_config: { effort: (settings["ai.effort"] as "low" | "medium" | "high") || "medium" },
      ...(FALLBACK_MODELS.has(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    usage.input += response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0);
    usage.output += response.usage.output_tokens;

    if (response.stop_reason === "refusal") {
      await escalate(business, ctx.conversation, "The assistant declined to answer this request");
      return { reply: "I'm not able to help with that here, so I've asked a team member to follow up with you.", usage };
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    if (response.stop_reason !== "tool_use") return { reply: text, usage };

    messages.push({ role: "assistant", content: response.content });
    const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const call of calls) {
      const out = await executeToolCall(ctx, call.name, (call.input ?? {}) as Record<string, unknown>);
      results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(out.result), is_error: out.isError || undefined });
    }
    messages.push({ role: "user", content: results });
  }
  return { reply: "Let me check with the team and get back to you shortly.", usage };
}

/** Run (or queue for approval) one tool call, writing the audit record either way. */
export async function executeToolCall(ctx: AgentContext, name: string, input: Record<string, unknown>) {
  const tool = TOOL_BY_NAME.get(name);
  const mode = modeFor(ctx.agent, name);
  const base = { id: newId("act"), businessId: ctx.business.id, agentId: ctx.agent.id, conversationId: ctx.conversation.id, tool: name, input };
  if (!tool || mode === "off") {
    await db.insert(schema.agentActions).values({ ...base, status: "failed", output: { error: "tool_disabled" }, summary: `Blocked: ${name}` });
    return { result: { error: "This action is not enabled for this business." }, isError: true };
  }
  let summary = name;
  try {
    summary = await tool.summarize(input, ctx);
  } catch {}

  if (mode === "approve") {
    await db.insert(schema.agentActions).values({ ...base, status: "pending_approval", summary });
    await notifyBusiness(ctx.business.id, { kind: "approval.requested", title: "Approval needed", body: summary, href: `/app/approvals` });
    return { result: { status: "pending_approval", message: "Queued for the team's approval. Tell the customer it will be confirmed shortly." }, isError: false };
  }
  try {
    const result = await tool.run(input, ctx);
    await db.insert(schema.agentActions).values({ ...base, status: "executed", output: result as object, summary });
    return { result, isError: false };
  } catch (e) {
    const message = e instanceof AppError ? e.message : "Something went wrong running this action.";
    if (!(e instanceof AppError)) console.error(`[agent] tool ${name}`, e);
    await db.insert(schema.agentActions).values({ ...base, status: "failed", output: { error: message }, summary });
    return { result: { error: message }, isError: true };
  }
}

// ---------------------------------------------------------------------------
// Offline mode: no model credentials configured. A small rule-based responder so the product is usable
// end-to-end in development and demos. It still uses the same data, tools and audit trail.
// ---------------------------------------------------------------------------

async function runOfflineTurn(ctx: AgentContext, text: string): Promise<string> {
  const t = text.toLowerCase();
  const { business } = ctx;
  const link = `${await getSetting("general.appUrl")}/b/${business.slug}`;
  const greet = ctx.agent.persona.greeting || `Hi! I'm ${ctx.agent.name}, ${business.name}'s assistant.`;

  if (/\b(human|person|someone|manager|complain|complaint|refund|angry)\b/.test(t)) {
    await executeToolCall(ctx, "escalate_to_human", { reason: `Customer asked: “${text.slice(0, 160)}”` });
    return "Of course. I've let the team know and someone will reply here shortly.";
  }
  const services = await db.select().from(schema.services).where(and(eq(schema.services.businessId, business.id), eq(schema.services.active, true)));
  if (/\b(book|appointment|available|availability|slot|free|tomorrow|today|rdv|réserver)\b/.test(t) && services.length) {
    const svc = services.find((s) => t.includes(s.name.toLowerCase())) ?? services[0];
    const days = await nextAvailableDays(business, { serviceId: svc.id, wantDays: 2 });
    if (!days.length) return `I couldn't find openings for ${svc.name} soon. You can check other dates here: ${link}`;
    const lines = days.map((d) => `${formatDate(new Date(d.slots[0].startsAt), business.timezone)}: ${d.slots.slice(0, 4).map((s) => formatTime(new Date(s.startsAt), business.timezone)).join(", ")}`);
    return `Next openings for ${svc.name}:\n${lines.join("\n")}\nBook in a few taps here: ${link}`;
  }
  if (/\b(price|prices|cost|how much|services|menu|tarif)\b/.test(t)) {
    return `Here's what we offer:\n${services.map((s) => `• ${s.name}: ${formatMoney(s.priceCents, business.currency)} (${s.durationMinutes} min)`).join("\n")}\nWant me to find you a time?`;
  }
  const hits = await searchKnowledge(business.id, text, 1);
  if (hits[0]) return hits[0].content.slice(0, 600);
  if (/\b(hi|hello|hey|bonjour|salut|hola)\b/.test(t)) return `${greet} I can share prices, find a time or book for you. What would you like?`;
  return `${greet} I can help with our services, prices and bookings. For anything else I'll pass you to the team. (Booking page: ${link})`;
}
