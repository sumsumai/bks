"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { decideAction } from "@/lib/agent/approvals";
import { getAgent, handleInbound } from "@/lib/agent/runtime";
import { cancelBooking, createBooking, rescheduleBooking, setBookingStatus } from "@/lib/bookings";
import { createBusiness } from "@/lib/businesses";
import { setServiceStaff, setStaffHours } from "@/lib/catalog";
import { disconnectChannel, enableTelegram, startWhatsAppLink } from "@/lib/channels";
import { appendMessage, deliver } from "@/lib/conversations";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/events";
import { eraseCustomer } from "@/lib/gdpr";
import { newId } from "@/lib/ids";
import { requireUser } from "@/lib/auth";
import { tenantFor } from "@/lib/tenant";
import { assertStaffAllowed } from "@/lib/catalog";
import { getSetting } from "@/lib/settings";
import { hhmmToMinutes, zonedToUtc } from "@/lib/time";
import { AgentPatch, BusinessPatch, KnowledgeInput, PersonaInput, ServiceInput } from "@/lib/validators";

export type ActionState = { ok?: boolean; error?: string; message?: string } | null;

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const on = (f: FormData, k: string) => f.get(k) === "on";
const int = (f: FormData, k: string, d = 0) => (f.get(k) === null || f.get(k) === "" ? d : Math.round(Number(f.get(k))));
const cents = (f: FormData, k: string) => Math.round(Number(String(f.get(k) ?? "0").replace(",", ".")) * 100);

/** Wrap a mutation so domain errors come back as form state instead of crashing the page. */
async function attempt(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const message = await fn();
    return { ok: true, message: message || undefined };
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    if (e instanceof z.ZodError) return { error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    if (e && typeof e === "object" && "digest" in e) throw e; // redirect / notFound
    console.error(e);
    return { error: "Something went wrong. Please try again." };
  }
}

// ---------------------------------------------------------------- onboarding

export async function onboard(_prev: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser("/app/onboarding");
  const res = await attempt(async () => {
    const name = s(f, "name");
    if (!name) throw new AppError(400, "bad_request", "Business name is required");
    const business = await createBusiness(user, {
      name,
      category: s(f, "category") || "other",
      city: s(f, "city"),
      timezone: s(f, "timezone") || "Europe/Paris",
      currency: s(f, "currency") || "EUR",
      locale: s(f, "language") || "en",
      phone: s(f, "phone"),
      description: s(f, "description"),
    });
    const svcName = s(f, "serviceName");
    if (svcName) {
      await db.insert(schema.services).values({ id: newId("svc"), businessId: business.id, name: svcName, durationMinutes: int(f, "serviceMinutes", 60), priceCents: cents(f, "servicePrice") });
    }
    const tone = PersonaInput.shape.tone.safeParse(s(f, "tone"));
    if (tone.success) {
      const agent = await getAgent(business.id);
      if (agent) await db.update(schema.agents).set({ persona: { ...agent.persona, tone: tone.data } }).where(eq(schema.agents.id, agent.id));
    }
    const { cookies } = await import("next/headers");
    (await cookies()).set("bks_biz", business.id, { path: "/", sameSite: "lax", httpOnly: true });
  });
  if (res?.error) return res;
  redirect("/app?welcome=1");
}

// ---------------------------------------------------------------- bookings

export async function bookingAction(f: FormData) {
  const t = await tenantFor("bookings.manage");
  const id = s(f, "bookingId");
  const action = s(f, "action");
  const actor = { type: "user" as const, id: t.user.id };
  try {
    if (action === "cancel") await cancelBooking(t.business, id, s(f, "reason"), actor);
    else if (action === "confirm") await setBookingStatus(t.business, id, "confirmed", actor);
    else if (action === "complete") await setBookingStatus(t.business, id, "completed", actor);
    else if (action === "no_show") await setBookingStatus(t.business, id, "no_show", actor);
  } catch (e) {
    if (!(e instanceof AppError)) throw e;
  }
  revalidatePath("/app", "layout");
}

export async function rescheduleAction(_prev: ActionState, f: FormData): Promise<ActionState> {
  const t = await tenantFor("bookings.manage");
  return attempt(async () => {
    const startsAt = zonedToUtc(s(f, "date"), hhmmToMinutes(s(f, "time")), t.business.timezone);
    await rescheduleBooking(t.business, s(f, "bookingId"), startsAt, { type: "user", id: t.user.id }, { staffId: s(f, "staffId") || null, override: on(f, "override") });
    revalidatePath("/app", "layout");
    return "Booking moved";
  });
}

export async function createBookingAction(_prev: ActionState, f: FormData): Promise<ActionState> {
  const t = await tenantFor("bookings.manage");
  return attempt(async () => {
    const startsAt = zonedToUtc(s(f, "date"), hhmmToMinutes(s(f, "time")), t.business.timezone);
    const customerId = s(f, "customerId");
    await createBooking(
      t.business,
      {
        serviceId: s(f, "serviceId"),
        staffId: s(f, "staffId") || null,
        startsAt,
        customer: customerId ? { id: customerId } : { name: s(f, "name"), email: s(f, "email") || null, phone: s(f, "phone") || null },
        source: "owner",
        notes: s(f, "notes"),
        override: on(f, "override"),
      },
      { type: "user", id: t.user.id },
    );
    revalidatePath("/app", "layout");
    return "Booking created";
  });
}

// ---------------------------------------------------------------- inbox & approvals

export async function replyAction(f: FormData) {
  const t = await tenantFor("inbox.reply");
  const text = s(f, "text");
  if (!text) return;
  const [conv] = await db.select().from(schema.conversations).where(and(eq(schema.conversations.id, s(f, "conversationId")), eq(schema.conversations.businessId, t.business.id)));
  if (!conv) return;
  if (!conv.humanTakeover) await db.update(schema.conversations).set({ humanTakeover: true }).where(eq(schema.conversations.id, conv.id));
  await appendMessage(conv, "owner", text, { authorUserId: t.user.id });
  await deliver(conv, text);
  revalidatePath(`/app/inbox/${conv.id}`);
}

export async function conversationAction(f: FormData) {
  const t = await tenantFor("inbox.reply");
  const action = s(f, "action");
  const id = s(f, "conversationId");
  const set =
    action === "takeover" ? { humanTakeover: true } : action === "release" ? { humanTakeover: false, status: "open" as const, escalationReason: null } : action === "close" ? { status: "closed" as const, humanTakeover: false } : { status: "open" as const };
  const [conv] = await db.update(schema.conversations).set(set).where(and(eq(schema.conversations.id, id), eq(schema.conversations.businessId, t.business.id))).returning();
  if (conv && action === "release") await appendMessage(conv, "system", "Conversation handed back to the assistant");
  if (conv && action === "takeover") await appendMessage(conv, "system", `${t.user.name} joined the conversation`);
  await audit(t.business.id, { type: "user", id: t.user.id }, `conversation.${action}`, id);
  revalidatePath("/app/inbox", "layout");
}

export async function decideAction_(f: FormData) {
  const t = await tenantFor("agent.approve");
  try {
    await decideAction(t.business, s(f, "actionId"), s(f, "decision") === "approve", t.user.id, s(f, "note") || undefined);
  } catch (e) {
    if (!(e instanceof AppError)) throw e;
  }
  revalidatePath("/app", "layout");
}

// ---------------------------------------------------------------- agent

export async function saveAgent(_prev: ActionState, f: FormData): Promise<ActionState> {
  const t = await tenantFor("agent.manage");
  return attempt(async () => {
    const agent = await getAgent(t.business.id);
    if (!agent) throw new AppError(404, "not_found", "Agent not found");
    const patch = AgentPatch.parse({
      name: s(f, "name"),
      instructions: s(f, "instructions"),
      escalationKeywords: s(f, "escalationKeywords"),
      persona: { tone: s(f, "tone"), language: s(f, "language"), formality: s(f, "formality"), emoji: on(f, "emoji"), greeting: s(f, "greeting"), signature: s(f, "signature") },
    });
    await db.update(schema.agents).set(patch as Partial<schema.Agent>).where(eq(schema.agents.id, agent.id));
    await audit(t.business.id, { type: "user", id: t.user.id }, "agent.updated", agent.id);
    revalidatePath("/app/agent");
    return "Saved. Your agent uses the new settings from its next message.";
  });
}

export async function savePermissions(_prev: ActionState, f: FormData): Promise<ActionState> {
  const t = await tenantFor("agent.manage");
  return attempt(async () => {
    const agent = await getAgent(t.business.id);
    if (!agent) throw new AppError(404, "not_found", "Agent not found");
    const permissions: schema.AgentPermissions = { ...agent.permissions };
    for (const [k, v] of f.entries()) if (k.startsWith("perm:") && (v === "auto" || v === "approve" || v === "off")) permissions[k.slice(5)] = v;
    await db.update(schema.agents).set({ permissions }).where(eq(schema.agents.id, agent.id));
    await audit(t.business.id, { type: "user", id: t.user.id }, "agent.permissions", agent.id, permissions);
    revalidatePath("/app/agent");
    return "Permissions updated";
  });
}

export async function toggleAgent(f: FormData) {
  const t = await tenantFor("agent.manage");
  const agent = await getAgent(t.business.id);
  if (!agent) return;
  const status = s(f, "status") === "active" ? "active" : "paused";
  await db.update(schema.agents).set({ status }).where(eq(schema.agents.id, agent.id));
  await audit(t.business.id, { type: "user", id: t.user.id }, `agent.${status}`, agent.id);
  revalidatePath("/app", "layout");
}

export async function playgroundSend(sessionId: string, text: string) {
  const t = await tenantFor("agent.manage");
  const r = await handleInbound({ business: t.business, channel: "web", threadId: `test:${t.user.id}:${sessionId}`, text: text.slice(0, 2000), customer: null });
  const rows = await db.select().from(schema.messages).where(eq(schema.messages.conversationId, r.conversationId)).orderBy(schema.messages.createdAt);
  const actions = await db.select().from(schema.agentActions).where(eq(schema.agentActions.conversationId, r.conversationId)).orderBy(schema.agentActions.createdAt);
  return {
    messages: rows.map((m) => ({ id: m.id, role: m.role, content: m.content })),
    actions: actions.map((a) => ({ id: a.id, tool: a.tool, status: a.status, summary: a.summary })),
  };
}

export async function saveKnowledge(_prev: ActionState, f: FormData): Promise<ActionState> {
  const t = await tenantFor("agent.manage");
  return attempt(async () => {
    const input = KnowledgeInput.parse({ kind: s(f, "kind") || "faq", title: s(f, "title"), content: s(f, "content") });
    const id = s(f, "id");
    if (id) {
      await db.update(schema.knowledgeItems).set({ ...input, updatedAt: new Date() }).where(and(eq(schema.knowledgeItems.id, id), eq(schema.knowledgeItems.businessId, t.business.id)));
    } else {
      await db.insert(schema.knowledgeItems).values({ id: newId("kno"), businessId: t.business.id, ...input });
    }
    revalidatePath("/app/agent/knowledge");
    return id ? "Updated" : "Added to knowledge";
  });
}

export async function uploadKnowledge(_prev: ActionState, f: FormData): Promise<ActionState> {
  const t = await tenantFor("agent.manage");
  return attempt(async () => {
    const file = f.get("file");
    if (!(file instanceof File) || !file.size) throw new AppError(400, "bad_request", "Choose a file");
    if (file.size > 1_000_000) throw new AppError(400, "bad_request", "Max 1 MB per document for now");
    if (!/\.(txt|md|csv|json|html?)$/i.test(file.name)) throw new AppError(400, "bad_request", "Supported: .txt, .md, .csv, .json, .html");
    let content = await file.text();
    if (/\.html?$/i.test(file.name)) content = content.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    await db.insert(schema.knowledgeItems).values({ id: newId("kno"), businessId: t.business.id, kind: "document", title: file.name, content: content.slice(0, 50_000), source: "upload" });
    revalidatePath("/app/agent/knowledge");
    return `Added ${file.name}`;
  });
}

export async function deleteKnowledge(f: FormData) {
  const t = await tenantFor("agent.manage");
  await db.delete(schema.knowledgeItems).where(and(eq(schema.knowledgeItems.id, s(f, "id")), eq(schema.knowledgeItems.businessId, t.business.id)));
  revalidatePath("/app/agent/knowledge");
}

export async function enableTelegramAction(_prev: ActionState, _f: FormData): Promise<ActionState> {
  const t = await tenantFor("agent.manage");
  return attempt(async () => {
    await enableTelegram(t.business, t.user.id);
    revalidatePath("/app/channels");
    return "Telegram is on. Share your link!";
  });
}

/** Start linking WhatsApp: QR by default, or a pairing code for the given phone number. */
export async function startWhatsAppLinkAction(phone?: string): Promise<ActionState> {
  const t = await tenantFor("agent.manage");
  return attempt(async () => {
    await startWhatsAppLink(t.business, t.user.id, phone || undefined);
  });
}

/** Polled by the linking UI. */
export async function whatsAppLinkState() {
  const t = await tenantFor("agent.manage");
  const [c] = await db.select().from(schema.channels).where(and(eq(schema.channels.businessId, t.business.id), eq(schema.channels.kind, "whatsapp")));
  return c ? { status: c.status, pairing: c.status === "pairing" ? c.pairing : null, displayName: c.displayName, lastError: c.lastError } : null;
}

export async function disconnectChannelAction(f: FormData) {
  const t = await tenantFor("agent.manage");
  await disconnectChannel(t.business, s(f, "kind") === "telegram" ? "telegram" : "whatsapp", t.user.id);
  revalidatePath("/app/channels");
}

// ---------------------------------------------------------------- catalog

export async function saveService(_prev: ActionState, f: FormData): Promise<ActionState> {
  const t = await tenantFor("catalog.manage");
  return attempt(async () => {
    const input = ServiceInput.parse({
      name: s(f, "name"),
      description: s(f, "description"),
      durationMinutes: int(f, "durationMinutes", 60),
      bufferMinutes: int(f, "bufferMinutes", 0),
      priceCents: cents(f, "price"),
      active: f.get("active") === null ? true : on(f, "active"),
    });
    const staffIds = f.getAll("staffIds").map(String);
    let id = s(f, "id");
    if (id) {
      await db.update(schema.services).set(input).where(and(eq(schema.services.id, id), eq(schema.services.businessId, t.business.id)));
    } else {
      id = newId("svc");
      await db.insert(schema.services).values({ id, businessId: t.business.id, ...input });
    }
    await setServiceStaff(t.business.id, id, staffIds);
    revalidatePath("/app/services");
    return "Service saved";
  });
}

export async function archiveService(f: FormData) {
  const t = await tenantFor("catalog.manage");
  await db.update(schema.services).set({ active: false }).where(and(eq(schema.services.id, s(f, "id")), eq(schema.services.businessId, t.business.id)));
  revalidatePath("/app/services");
}

export async function saveStaff(_prev: ActionState, f: FormData): Promise<ActionState> {
  const t = await tenantFor("catalog.manage");
  return attempt(async () => {
    const name = s(f, "name");
    if (!name) throw new AppError(400, "bad_request", "Name is required");
    const values = { name, title: s(f, "title"), bio: s(f, "bio"), color: s(f, "color") || "#6366f1", active: f.get("active") === null ? true : on(f, "active") };
    let id = s(f, "id");
    if (id) {
      const [row] = await db.update(schema.staff).set(values).where(and(eq(schema.staff.id, id), eq(schema.staff.businessId, t.business.id))).returning();
      if (!row) throw new AppError(404, "not_found", "Staff member not found");
    } else {
      await assertStaffAllowed(t.business);
      id = newId("stf");
      await db.insert(schema.staff).values({ id, businessId: t.business.id, ...values });
    }
    const hours: { weekday: number; startMinute: number; endMinute: number }[] = [];
    for (let d = 0; d < 7; d++) {
      if (!on(f, `day${d}`)) continue;
      const start = hhmmToMinutes(s(f, `start${d}`) || "09:00");
      const end = hhmmToMinutes(s(f, `end${d}`) || "18:00");
      if (end <= start) throw new AppError(400, "bad_request", "Closing time must be after opening time");
      const bs = s(f, `breakStart${d}`);
      const be = s(f, `breakEnd${d}`);
      if (bs && be && hhmmToMinutes(be) > hhmmToMinutes(bs)) {
        hours.push({ weekday: d, startMinute: start, endMinute: hhmmToMinutes(bs) }, { weekday: d, startMinute: hhmmToMinutes(be), endMinute: end });
      } else hours.push({ weekday: d, startMinute: start, endMinute: end });
    }
    await setStaffHours(t.business.id, id, hours.filter((h) => h.endMinute > h.startMinute));
    revalidatePath("/app/team");
    return "Saved";
  });
}

export async function addTimeOff(_prev: ActionState, f: FormData): Promise<ActionState> {
  const t = await tenantFor("catalog.manage");
  return attempt(async () => {
    const tz = t.business.timezone;
    const startsAt = zonedToUtc(s(f, "from"), 0, tz);
    const endsAt = zonedToUtc(s(f, "to"), 24 * 60, tz);
    if (endsAt <= startsAt) throw new AppError(400, "bad_request", "End must be after start");
    await db.insert(schema.timeOff).values({ id: newId("off"), businessId: t.business.id, staffId: s(f, "staffId") || null, startsAt, endsAt, reason: s(f, "reason") });
    revalidatePath("/app/team");
    return "Time off added";
  });
}

export async function deleteTimeOff(f: FormData) {
  const t = await tenantFor("catalog.manage");
  await db.delete(schema.timeOff).where(and(eq(schema.timeOff.id, s(f, "id")), eq(schema.timeOff.businessId, t.business.id)));
  revalidatePath("/app/team");
}

// ---------------------------------------------------------------- settings & customers

export async function saveSettings(_prev: ActionState, f: FormData): Promise<ActionState> {
  const t = await tenantFor("business.manage");
  return attempt(async () => {
    const patch = BusinessPatch.parse({
      name: s(f, "name"),
      tagline: s(f, "tagline"),
      description: s(f, "description"),
      category: s(f, "category"),
      city: s(f, "city"),
      phone: s(f, "phone"),
      email: s(f, "email"),
      website: s(f, "website"),
      timezone: s(f, "timezone"),
      currency: s(f, "currency").toUpperCase(),
      brandColor: s(f, "brandColor"),
      coverUrl: s(f, "coverUrl") || null,
      logoUrl: s(f, "logoUrl") || null,
      published: on(f, "published"),
      policy: {
        minNoticeMinutes: int(f, "minNoticeMinutes", 120),
        maxAdvanceDays: int(f, "maxAdvanceDays", 60),
        cancellationWindowHours: int(f, "cancellationWindowHours", 24),
        slotIntervalMinutes: int(f, "slotIntervalMinutes", 15),
        autoConfirm: on(f, "autoConfirm"),
        requirePayment: on(f, "requirePayment"),
        policyText: s(f, "policyText"),
      },
    });
    let note = "";
    if (patch.published && !t.business.published && !(await getSetting("general.autoPublish"))) {
      patch.published = false;
      note = " Publishing needs approval from the platform team; we've been notified.";
      await audit(t.business.id, { type: "user", id: t.user.id }, "business.publish_requested", t.business.id);
    }
    await db.update(schema.businesses).set(patch).where(eq(schema.businesses.id, t.business.id));
    await audit(t.business.id, { type: "user", id: t.user.id }, "business.updated", t.business.id);
    if (note) {
      revalidatePath("/app", "layout");
      return `Settings saved.${note}`;
    }
    revalidatePath("/app", "layout");
    return "Settings saved";
  });
}

export async function saveCustomerNotes(f: FormData) {
  const t = await tenantFor("customers.manage");
  await db.update(schema.customers).set({ notes: s(f, "notes") }).where(and(eq(schema.customers.id, s(f, "id")), eq(schema.customers.businessId, t.business.id)));
  revalidatePath(`/app/customers/${s(f, "id")}`);
}

export async function eraseCustomerAction(f: FormData) {
  const t = await tenantFor("customers.manage");
  await eraseCustomer(t.business.id, s(f, "id"), t.user.id);
  redirect("/app/customers");
}

export async function markNotificationsRead() {
  const t = await tenantFor("bookings.view");
  const { isNull } = await import("drizzle-orm");
  await db.update(schema.notifications).set({ readAt: new Date() }).where(and(eq(schema.notifications.businessId, t.business.id), isNull(schema.notifications.readAt)));
  revalidatePath("/app");
}
