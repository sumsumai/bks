import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { eligibleStaff, getSlots, nextAvailableDays } from "../availability";
import { cancelBooking, createBooking, rescheduleBooking } from "../bookings";
import { AppError } from "../errors";
import { newId } from "../ids";
import { searchKnowledge } from "../knowledge";
import { getSetting } from "../settings";
import { formatDateTime, formatMoney } from "../time";

/**
 * Everything a tool may touch is reachable only through this context. The business is bound when the
 * agent turn starts; no tool accepts a business id, and booking tools only see the conversation's customer.
 */
export type AgentContext = {
  business: schema.Business;
  agent: schema.Agent;
  conversation: schema.Conversation;
  customer: schema.Customer | null;
  /** Lets a tool attach a customer created mid-conversation (web chat). */
  setCustomer: (c: schema.Customer) => Promise<void>;
};

export type ToolMode = "auto" | "approve" | "off";

type ToolDef = {
  name: string;
  description: string;
  input_schema: Anthropic.Tool["input_schema"];
  /** Default permission when the business has not configured one. */
  defaultMode: ToolMode;
  /** Tools that can never be switched off or gated (escalation must always work). */
  locked?: boolean;
  /** Human-readable label for settings screens. */
  label: string;
  summarize: (input: any, ctx: AgentContext) => Promise<string> | string;
  run: (input: any, ctx: AgentContext) => Promise<unknown>;
};

const obj = (properties: Record<string, unknown>, required: string[] = []): Anthropic.Tool["input_schema"] => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

async function serviceName(businessId: string, id: string) {
  const [s] = await db.select({ name: schema.services.name }).from(schema.services).where(and(eq(schema.services.id, id), eq(schema.services.businessId, businessId)));
  return s?.name ?? "a service";
}

async function ownBooking(ctx: AgentContext, bookingId: string) {
  if (!ctx.customer) throw new AppError(403, "unknown_customer", "I can only change bookings for a known customer.");
  const [b] = await db
    .select()
    .from(schema.bookings)
    .where(and(eq(schema.bookings.id, bookingId), eq(schema.bookings.businessId, ctx.business.id), eq(schema.bookings.customerId, ctx.customer.id)));
  if (!b) throw new AppError(404, "not_found", "No booking with that id belongs to this customer.");
  return b;
}

export const TOOLS: ToolDef[] = [
  {
    name: "list_services",
    label: "List services & prices",
    description: "List the business's bookable services with id, price, duration and who performs them.",
    input_schema: obj({}),
    defaultMode: "auto",
    summarize: () => "List services",
    async run(_i, ctx) {
      const svcs = await db
        .select()
        .from(schema.services)
        .where(and(eq(schema.services.businessId, ctx.business.id), eq(schema.services.active, true)))
        .orderBy(asc(schema.services.sortOrder));
      return Promise.all(
        svcs.map(async (s) => ({
          service_id: s.id,
          name: s.name,
          description: s.description,
          duration_minutes: s.durationMinutes,
          price: formatMoney(s.priceCents, ctx.business.currency),
          staff: (await eligibleStaff(ctx.business.id, s.id)).map((st) => ({ staff_id: st.id, name: st.name })),
        })),
      );
    },
  },
  {
    name: "check_availability",
    label: "Check availability",
    description:
      "Find open appointment times for a service. Give `date` (YYYY-MM-DD, business local time) for one day, or omit it to get the next days with openings. Optionally restrict to one staff member.",
    input_schema: obj(
      {
        service_id: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD in the business's timezone" },
        staff_id: { type: "string" },
      },
      ["service_id"],
    ),
    defaultMode: "auto",
    summarize: async (i, ctx) => `Check availability for ${await serviceName(ctx.business.id, i.service_id)}`,
    async run(i, ctx) {
      const shape = (slots: Awaited<ReturnType<typeof getSlots>>) =>
        slots.slice(0, 16).map((s) => ({ starts_at: s.startsAt, local_time: s.time, staff_ids: s.staffIds }));
      if (i.date) {
        const slots = await getSlots(ctx.business, { serviceId: i.service_id, date: i.date, staffId: i.staff_id });
        return { date: i.date, slots: shape(slots), note: slots.length ? undefined : "No openings that day." };
      }
      const days = await nextAvailableDays(ctx.business, { serviceId: i.service_id, staffId: i.staff_id, wantDays: 3 });
      return days.map((d) => ({ date: d.date, slots: shape(d.slots) }));
    },
  },
  {
    name: "create_booking",
    label: "Create bookings",
    description:
      "Book an appointment. `starts_at` must be a slot returned by check_availability (ISO UTC). If the customer is not yet known, include their name and a phone or email. Always confirm service, time and name with the customer before calling.",
    input_schema: obj(
      {
        service_id: { type: "string" },
        starts_at: { type: "string", description: "ISO 8601 UTC instant from check_availability" },
        staff_id: { type: "string" },
        customer_name: { type: "string" },
        customer_phone: { type: "string" },
        customer_email: { type: "string" },
        notes: { type: "string" },
      },
      ["service_id", "starts_at"],
    ),
    defaultMode: "auto",
    summarize: async (i, ctx) =>
      `Book ${await serviceName(ctx.business.id, i.service_id)} on ${formatDateTime(new Date(i.starts_at), ctx.business.timezone)}${i.customer_name ? ` for ${i.customer_name}` : ""}`,
    async run(i, ctx) {
      let customer = ctx.customer;
      if (!customer) {
        if (!i.customer_name || (!i.customer_phone && !i.customer_email))
          return { error: "missing_customer_details", message: "Ask for the customer's name and a phone number or email first." };
        const { findOrCreateCustomer } = await import("../bookings");
        customer = await findOrCreateCustomer(ctx.business.id, { name: i.customer_name, phone: i.customer_phone, email: i.customer_email });
        await ctx.setCustomer(customer);
      }
      const source = ctx.conversation.channel === "web" ? "agent" : ctx.conversation.channel;
      const { booking, service, staff } = await createBooking(
        ctx.business,
        { serviceId: i.service_id, startsAt: i.starts_at, staffId: i.staff_id, customer: { id: customer.id }, source, notes: i.notes },
        { type: "agent", id: ctx.agent.id },
      );
      return {
        booking_id: booking.id,
        status: booking.status,
        service: service.name,
        with: staff.name,
        when: formatDateTime(booking.startsAt, ctx.business.timezone),
        price: formatMoney(booking.priceCents, ctx.business.currency),
        manage_link: `${await getSetting("general.appUrl")}/manage/${booking.manageToken}`,
      };
    },
  },
  {
    name: "list_customer_bookings",
    label: "Look up customer's bookings",
    description: "List this customer's upcoming bookings (only the customer you are talking to).",
    input_schema: obj({}),
    defaultMode: "auto",
    summarize: () => "Look up the customer's upcoming bookings",
    async run(_i, ctx) {
      if (!ctx.customer) return { bookings: [], note: "Customer not identified yet." };
      const rows = await db
        .select({ b: schema.bookings, service: schema.services.name, staff: schema.staff.name })
        .from(schema.bookings)
        .innerJoin(schema.services, eq(schema.services.id, schema.bookings.serviceId))
        .innerJoin(schema.staff, eq(schema.staff.id, schema.bookings.staffId))
        .where(
          and(
            eq(schema.bookings.businessId, ctx.business.id),
            eq(schema.bookings.customerId, ctx.customer.id),
            inArray(schema.bookings.status, ["pending", "confirmed"]),
            gt(schema.bookings.startsAt, new Date()),
          ),
        )
        .orderBy(asc(schema.bookings.startsAt));
      return rows.map((r) => ({
        booking_id: r.b.id,
        service: r.service,
        with: r.staff,
        when: formatDateTime(r.b.startsAt, ctx.business.timezone),
        starts_at: r.b.startsAt.toISOString(),
        status: r.b.status,
      }));
    },
  },
  {
    name: "reschedule_booking",
    label: "Reschedule bookings",
    description: "Move one of this customer's bookings to a new slot from check_availability.",
    input_schema: obj({ booking_id: { type: "string" }, new_starts_at: { type: "string" } }, ["booking_id", "new_starts_at"]),
    defaultMode: "auto",
    summarize: (i, ctx) => `Move booking to ${formatDateTime(new Date(i.new_starts_at), ctx.business.timezone)}`,
    async run(i, ctx) {
      await ownBooking(ctx, i.booking_id);
      const b = await rescheduleBooking(ctx.business, i.booking_id, i.new_starts_at, { type: "agent", id: ctx.agent.id });
      return { booking_id: b.id, when: formatDateTime(b.startsAt, ctx.business.timezone), status: b.status };
    },
  },
  {
    name: "cancel_booking",
    label: "Cancel bookings",
    description: "Cancel one of this customer's bookings. Confirm with the customer first.",
    input_schema: obj({ booking_id: { type: "string" }, reason: { type: "string" } }, ["booking_id"]),
    defaultMode: "approve",
    summarize: async (i, ctx) => {
      const [b] = await db.select().from(schema.bookings).where(and(eq(schema.bookings.id, i.booking_id), eq(schema.bookings.businessId, ctx.business.id)));
      return b ? `Cancel booking on ${formatDateTime(b.startsAt, ctx.business.timezone)}${i.reason ? ` (${i.reason})` : ""}` : "Cancel a booking";
    },
    async run(i, ctx) {
      await ownBooking(ctx, i.booking_id);
      const b = await cancelBooking(ctx.business, i.booking_id, i.reason ?? "", { type: "agent", id: ctx.agent.id });
      return { booking_id: b.id, status: b.status };
    },
  },
  {
    name: "search_knowledge",
    label: "Search knowledge base",
    description: "Search the business's knowledge base (FAQs, policies, documents) for facts you are not sure about.",
    input_schema: obj({ query: { type: "string" } }, ["query"]),
    defaultMode: "auto",
    summarize: (i) => `Search knowledge: “${i.query}”`,
    async run(i, ctx) {
      const hits = await searchKnowledge(ctx.business.id, i.query, 4);
      return hits.length ? hits.map((h) => ({ title: h.title, content: h.content.slice(0, 1500) })) : { note: "Nothing found. Do not guess; offer to ask the team." };
    },
  },
  {
    name: "remember_customer_fact",
    label: "Remember customer preferences",
    description: "Save a durable, useful fact about this customer (preferences, allergies, favourite staff). Never store payment data or secrets.",
    input_schema: obj({ fact: { type: "string" } }, ["fact"]),
    defaultMode: "auto",
    summarize: (i) => `Remember: ${i.fact}`,
    async run(i, ctx) {
      if (!ctx.customer) return { note: "Customer not identified; nothing saved." };
      await db.insert(schema.customerMemories).values({ id: newId("mem"), businessId: ctx.business.id, customerId: ctx.customer.id, fact: String(i.fact).slice(0, 500) });
      return { saved: true };
    },
  },
  {
    name: "escalate_to_human",
    label: "Escalate to a human",
    description:
      "Hand the conversation to the team: complaints, refunds, medical or legal questions, anything sensitive, anything you cannot answer from your knowledge, or when the customer asks for a person.",
    input_schema: obj({ reason: { type: "string" } }, ["reason"]),
    defaultMode: "auto",
    locked: true,
    summarize: (i) => `Escalate: ${i.reason}`,
    async run(i, ctx) {
      const { escalate } = await import("./escalation");
      await escalate(ctx.business, ctx.conversation, String(i.reason));
      return { escalated: true, note: "Tell the customer a team member will reply here shortly." };
    },
  },
];

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

export function defaultPermissions(): Record<string, ToolMode> {
  return Object.fromEntries(TOOLS.map((t) => [t.name, t.defaultMode]));
}

export function modeFor(agent: schema.Agent, name: string): ToolMode {
  const t = TOOL_BY_NAME.get(name);
  if (!t) return "off";
  if (t.locked) return "auto";
  return agent.permissions[name] ?? t.defaultMode;
}

/** Tool definitions for the model: tools switched off are not offered at all. */
export function toolsFor(agent: schema.Agent): Anthropic.Tool[] {
  return TOOLS.filter((t) => modeFor(agent, t.name) !== "off").map((t) => ({
    name: t.name,
    description: modeFor(agent, t.name) === "approve" ? `${t.description} (Requires team approval: the action is queued, not done immediately.)` : t.description,
    input_schema: t.input_schema,
  }));
}
